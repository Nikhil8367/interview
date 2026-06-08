import React, { useState, useEffect, useRef } from 'react';
import QuestionManager, { PRESETS } from './components/QuestionManager';
import InterviewConsole from './components/InterviewConsole';
import AssessmentReport from './components/AssessmentReport';
import MockInterviewSetup from './components/MockInterviewSetup';
import MockInterviewReport from './components/MockInterviewReport';
import Auth from './components/Auth';
import HistoryView from './components/HistoryView';
import RealtimeMock from './components/RealtimeMock';
import { Sparkles, Key, RefreshCw, Settings, X, BookOpen, Tv, History, Sliders, LogOut, Mic, Menu } from 'lucide-react';
import { API_BASE } from './config';
import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('verbalyst_user');
    const timestamp = localStorage.getItem('verbalyst_login_timestamp');
    if (saved && timestamp) {
      const parsedTime = parseInt(timestamp, 10);
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - parsedTime < oneDay) {
        return JSON.parse(saved);
      } else {
        localStorage.removeItem('verbalyst_user');
        localStorage.removeItem('verbalyst_login_timestamp');
      }
    }
    return null;
  });
  const [questions, setQuestions] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [assessmentReport, setAssessmentReport] = useState(null);
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    return localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
  });
  const [sttProvider, setSttProvider] = useState(() => {
    const saved = localStorage.getItem('verbalyst_stt_provider');
    if (saved) return saved;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return isMobile ? 'puter' : 'native';
  });
  const [sttApiKeys, setSttApiKeys] = useState(() => {
    const saved = localStorage.getItem('verbalyst_stt_api_keys');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse stt api keys:", e);
      }
    }
    // Migrate old single key if present
    const oldKey = localStorage.getItem('verbalyst_stt_api_key') || '';
    return {
      groq: oldKey,
      openai: oldKey,
      elevenlabs: oldKey,
      assemblyai: oldKey
    };
  });

  // General Settings States
  const [showTimer, setShowTimer] = useState(() => {
    return localStorage.getItem('verbalyst_show_timer') !== 'false';
  });
  const [showCalibration, setShowCalibration] = useState(() => {
    return localStorage.getItem('verbalyst_show_calibration') !== 'false';
  });
  const [bionicReading, setBionicReading] = useState(() => {
    return localStorage.getItem('verbalyst_bionic_reading') === 'true';
  });

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState('practice'); // 'practice' | 'mock'

  // Mobile nav state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  // Onboarding companion tour state
  const [showTour, setShowTour] = useState(() => {
    return sessionStorage.getItem('verbalyst_tour_dismissed') !== 'true';
  });

  // Settings Drawer Toggle State
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Fetch scoped questions for user
  useEffect(() => {
    if (!user) return;
    const fetchQuestions = async () => {
      try {
        const q = query(collection(db, 'questions'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (data.length === 0) {
          console.log("No questions found in Firestore for user, auto-seeding PRESETS...");
          const batch = writeBatch(db);
          PRESETS.forEach(p => {
            const qId = `q_${p.id}_${user.id}`;
            const qRef = doc(db, 'questions', qId);
            batch.set(qRef, {
              ...p,
              id: qId,
              userId: user.id
            });
          });
          await batch.commit();
          
          const freshSnapshot = await getDocs(q);
          data = freshSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        setQuestions(data);
        // Set first question active by default if none selected
        if (data.length > 0 && !activeQuestion) {
          setActiveQuestion(data[0]);
        }
      } catch (err) {
        console.error("Error fetching questions:", err);
      }
    };
    fetchQuestions();
  }, [user]);

  // Mock Interview States
  const [mockStatus, setMockStatus] = useState('setup'); // 'setup' | 'interview' | 'analyzing' | 'report'
  const [mockConfig, setMockConfig] = useState(null);
  const [mockQuestions, setMockQuestions] = useState([]);
  const [currentMockIndex, setCurrentMockIndex] = useState(0);
  const [mockAnswers, setMockAnswers] = useState([]);
  const [mockReport, setMockReport] = useState(null);
  const [mockTimeRemaining, setMockTimeRemaining] = useState(0);

  // Refs for tracking real-time answer progress to submit on timeout
  const currentAnswerRef = useRef({ transcript: '', elapsedTime: 0, breaksCount: 0 });
  const mockStateRef = useRef({ mockStatus, mockQuestions, currentMockIndex, mockAnswers });
  const isEvaluatingMockRef = useRef(false);

  // Update mockStateRef on change to avoid stale closure in timer interval
  useEffect(() => {
    mockStateRef.current = { mockStatus, mockQuestions, currentMockIndex, mockAnswers };
  }, [mockStatus, mockQuestions, currentMockIndex, mockAnswers]);

  // Global Mock Interview Countdown Timer
  useEffect(() => {
    if (mockStatus !== 'interview') return;

    const interval = setInterval(() => {
      setMockTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          
          // Trigger timeout submit safely outside active state update cycle
          setTimeout(() => {
            alert("Interview time limit reached! Submitting your answers for evaluation.");
            
            let finalAnswers = [...mockStateRef.current.mockAnswers];
            // If the user was speaking, include their answer in progress
            if (currentAnswerRef.current.transcript.trim()) {
              finalAnswers.push({
                question: mockStateRef.current.mockQuestions[mockStateRef.current.currentMockIndex],
                transcript: currentAnswerRef.current.transcript,
                duration: currentAnswerRef.current.elapsedTime || 5,
                breaksCount: currentAnswerRef.current.breaksCount || 0
              });
            }
            
            handleEvaluateMock(finalAnswers);
          }, 10);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [mockStatus]);

  // Restore interrupted mock session if found on load
  useEffect(() => {
    const savedActiveMock = localStorage.getItem('verbalyst_active_mock');
    if (savedActiveMock) {
      try {
        const { mockConfig, mockQuestions, currentMockIndex, mockAnswers, mockTimeRemaining } = JSON.parse(savedActiveMock);
        if (mockConfig && mockQuestions && mockQuestions.length > 0) {
          const confirmResume = window.confirm("We detected an interrupted mock interview session. Would you like to resume it?");
          if (confirmResume) {
            setMockConfig(mockConfig);
            setMockQuestions(mockQuestions);
            setCurrentMockIndex(currentMockIndex);
            setMockAnswers(mockAnswers);
            setMockTimeRemaining(mockTimeRemaining);
            setMockStatus('interview');
            setActiveTab('mock');
          } else {
            localStorage.removeItem('verbalyst_active_mock');
          }
        }
      } catch (e) {
        console.error("Failed to restore active mock session:", e);
      }
    }
  }, []);

  // Auto-save active mock interview state to recover on refresh/crash
  useEffect(() => {
    if (mockStatus === 'interview') {
      const activeState = {
        mockConfig,
        mockQuestions,
        currentMockIndex,
        mockAnswers,
        mockTimeRemaining
      };
      localStorage.setItem('verbalyst_active_mock', JSON.stringify(activeState));
    } else if (mockStatus === 'setup' || mockStatus === 'report') {
      localStorage.removeItem('verbalyst_active_mock');
    }
  }, [mockStatus, mockConfig, mockQuestions, currentMockIndex, mockAnswers, mockTimeRemaining]);

  // Auto-sync pending reports on application load
  useEffect(() => {
    if (!user) return;

    const syncPendingReports = async () => {
      let queue = [];
      try {
        const saved = localStorage.getItem('verbalyst_pending_reports');
        queue = saved ? JSON.parse(saved) : [];
      } catch (e) {
        return;
      }

      if (queue.length === 0) return;
      console.log(`Found ${queue.length} pending reports to sync...`);

      const remainingQueue = [];
      for (const item of queue) {
        if (item.userId !== user.id) {
          remainingQueue.push(item);
          continue;
        }

        try {
          await setDoc(doc(db, 'reports', item.id), {
            ...item.report,
            userId: user.id
          });
          console.log(`Synced pending report ${item.id} successfully.`);
        } catch (err) {
          console.error(`Error syncing report ${item.id}:`, err);
          remainingQueue.push(item);
        }
      }

      localStorage.setItem('verbalyst_pending_reports', JSON.stringify(remainingQueue));
    };

    syncPendingReports();
  }, [user]);

  const handleSelectQuestion = (q) => {
    setActiveQuestion(q);
    setAssessmentReport(null); // clear assessment when switching questions
  };

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  // Mock Interview Actions
  const handleStartMock = (config) => {
    setMockConfig(config);
    const pool = questions.filter(q => config.categories.includes(q.category || 'General'));
    // Randomize all questions matching categories
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    
    setMockQuestions(shuffled);
    setCurrentMockIndex(0);
    setMockAnswers([]);
    setMockReport(null);
    setMockTimeRemaining(config.durationLimit);
    setMockStatus('interview');
    currentAnswerRef.current = { transcript: '', elapsedTime: 0, breaksCount: 0 };
  };

  const handleNextMockQuestion = (answer) => {
    // Reset tracker for the next question
    currentAnswerRef.current = { transcript: '', elapsedTime: 0, breaksCount: 0 };
    
    const updatedAnswers = [...mockAnswers, answer];
    setMockAnswers(updatedAnswers);
    
    // Check if time is already up or if we reached the end of the question pool
    if (mockTimeRemaining <= 0) {
      handleEvaluateMock(updatedAnswers);
    } else if (currentMockIndex < mockQuestions.length - 1) {
      setCurrentMockIndex(currentMockIndex + 1);
    } else {
      // Completed all questions in the pool
      handleEvaluateMock(updatedAnswers);
    }
  };

  const saveReportWithBackupQueue = async (reportData, type) => {
    if (!user) return;

    // Generate unique ID and timestamp on client to prevent duplication
    const reportId = reportData.id || 'rep_' + Math.random().toString(36).substr(2, 9);
    const reportTimestamp = reportData.timestamp || new Date().toISOString();

    const finalReport = {
      ...reportData,
      id: reportId,
      timestamp: reportTimestamp,
      type
    };

    const queueItem = {
      id: 'pending_' + reportId,
      userId: user.id,
      report: finalReport,
      timestamp: reportTimestamp
    };

    let queue = [];
    try {
      const saved = localStorage.getItem('verbalyst_pending_reports');
      queue = saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse pending reports:", e);
    }

    queue.push(queueItem);
    try {
      localStorage.setItem('verbalyst_pending_reports', JSON.stringify(queue));
    } catch (storageErr) {
      console.warn("Storage quota exceeded, unable to save backup report to localStorage:", storageErr);
    }

    try {
      await setDoc(doc(db, 'reports', finalReport.id), {
        ...finalReport,
        userId: user.id,
        timestamp: finalReport.timestamp || new Date().toISOString()
      });

      let currentQueue = [];
      try {
        const saved = localStorage.getItem('verbalyst_pending_reports');
        currentQueue = saved ? JSON.parse(saved) : [];
      } catch (e) {}
      currentQueue = currentQueue.filter(item => item.id !== queueItem.id);
      try {
        localStorage.setItem('verbalyst_pending_reports', JSON.stringify(currentQueue));
      } catch (storageErr) {}
      console.log("Report saved successfully and synced with DB.");
    } catch (err) {
      console.error("Network error saving report to db (will auto-retry on reload):", err);
    }
  };

  const handleEvaluateMock = async (answers) => {
    if (isEvaluatingMockRef.current) {
      console.log("Mock evaluation already in progress. Ignoring duplicate trigger.");
      return;
    }
    isEvaluatingMockRef.current = true;
    setMockStatus('analyzing');
    try {
      let reportResult = null;
      if (apiKey) {
        const { analyzeMockInterviewWithGemini } = await import('./utils/aiEngine');
        reportResult = await analyzeMockInterviewWithGemini(answers, apiKey, geminiModel);
      } else {
        const { analyzeMockInterviewLocally } = await import('./utils/aiEngine');
        reportResult = analyzeMockInterviewLocally(answers);
      }

      // Save report with backup queue
      if (user) {
        await saveReportWithBackupQueue(reportResult, 'mock');
      }

      setMockReport(reportResult);
      setMockStatus('report');
    } catch (err) {
      console.error("Mock interview evaluation failed:", err);
      alert("Something went wrong during evaluation. Please try again.");
      setMockStatus('interview');
    } finally {
      isEvaluatingMockRef.current = false;
    }
  };

  const handleAssessmentComplete = async (report) => {
    setAssessmentReport(report);
    if (!user) return;
    await saveReportWithBackupQueue(report, 'practice');
  };

  const handleCancelMock = () => {
    setMockStatus('setup');
    setMockConfig(null);
    setMockQuestions([]);
    setCurrentMockIndex(0);
    setMockAnswers([]);
    setMockReport(null);
  };

  const formatCountdown = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!user) {
    return (
      <Auth onLogin={(loggedInUser) => {
        setUser(loggedInUser);
        localStorage.setItem('verbalyst_user', JSON.stringify(loggedInUser));
        localStorage.setItem('verbalyst_login_timestamp', Date.now().toString());
      }} />
    );
  }

  const dismissTour = () => {
    setShowTour(false);
    sessionStorage.setItem('verbalyst_tour_dismissed', 'true');
  };

  const showSidebar = activeTab !== 'history' && 
                      activeTab !== 'realtime-mock' &&
                      !(activeTab === 'mock' && mockStatus !== 'interview') && 
                      !(activeTab === 'practice' && assessmentReport);

  return (
    <div className="app-container">
      {/* Mobile Nav Overlay */}
      <div
        className={`mobile-nav-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className={`mobile-nav-sheet ${mobileMenuOpen ? 'open' : ''}`}>
        {[
          { id: 'practice', icon: <BookOpen size={18} />, label: 'Practice Arena', activeClass: 'active' },
          { id: 'mock', icon: <Tv size={18} />, label: 'Full Mock Interview', activeClass: 'active-mock' },
          { id: 'realtime-mock', icon: <Mic size={18} />, label: 'Realtime Live Arena', activeClass: 'active' },
          { id: 'history', icon: <History size={18} />, label: 'History & Analytics', activeClass: 'active-history' },
        ].map(({ id, icon, label, activeClass }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`mobile-nav-item ${activeTab === id ? activeClass : ''}`}
          >
            {icon} {label}
          </button>
        ))}
        <div className="mobile-nav-handle" />
      </div>

      {/* Premium Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <Sparkles size={20} fill="white" />
          </div>
          <div>
            <h1 className="logo-text">
              Verbalyst <span className="logo-badge">AI COACH</span>
            </h1>
            <p className="logo-subtitle">
              Voice Analysis &amp; AI Assessments
            </p>
          </div>
        </div>

        {/* Navigation Tabs — desktop */}
        <div className="nav-pill-container" style={{ margin: '0 auto 0 1.5rem' }}>
          <button
            onClick={() => setActiveTab('practice')}
            className={`nav-pill-btn ${activeTab === 'practice' ? 'active-practice' : ''}`}
          >
            <BookOpen size={15} />
            <span className="nav-label-long">Practice Arena</span>
            <span className="nav-label-short">Practice</span>
          </button>
          <button
            onClick={() => setActiveTab('mock')}
            className={`nav-pill-btn ${activeTab === 'mock' ? 'active-mock' : ''}`}
          >
            <Tv size={15} />
            <span className="nav-label-long">Full Mock Interview</span>
            <span className="nav-label-short">Mock</span>
          </button>
          <button
            onClick={() => setActiveTab('realtime-mock')}
            className={`nav-pill-btn ${activeTab === 'realtime-mock' ? 'active-practice' : ''}`}
          >
            <Mic size={15} />
            <span className="nav-label-long">Realtime Live Arena</span>
            <span className="nav-label-short">Live</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`nav-pill-btn ${activeTab === 'history' ? 'active-history' : ''}`}
          >
            <History size={15} />
            <span className="nav-label-long">History &amp; Analytics</span>
            <span className="nav-label-short">History</span>
          </button>
        </div>

        <div className="header-controls">
          {/* Desktop user badge */}
          <div className="user-badge-full" style={{ alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>{user.username}</span>
          </div>
          {/* Mobile compact badge */}
          <div className="user-badge-compact" style={{ alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</span>
          </div>

          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setSettingsOpen(true)}
            title="Configure System Settings"
            style={{ width: '2.25rem', height: '2.25rem', borderRadius: '8px' }}
          >
            <Settings size={16} />
          </button>

          {/* Mobile hamburger */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            title="Open Navigation"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Settings Drawer Backdrop */}
      <div 
        className={`settings-drawer-backdrop ${settingsOpen ? 'open' : ''}`} 
        onClick={() => setSettingsOpen(false)} 
      />

      {/* Settings Drawer Content */}
      <div className={`settings-drawer-panel ${settingsOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={20} className="text-primary" />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>System Settings</h2>
          </div>
          <button className="drawer-close-btn" onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="drawer-content">
          {/* General Settings */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Sliders size={16} className="text-secondary" />
              <span>General Settings</span>
            </div>
            <p className="drawer-description">
              Customize the appearance and behavior of your training console.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={showTimer}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowTimer(checked);
                    localStorage.setItem('verbalyst_show_timer', checked ? 'true' : 'false');
                  }}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Show Interview Timer
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={showCalibration}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowCalibration(checked);
                    localStorage.setItem('verbalyst_show_calibration', checked ? 'true' : 'false');
                  }}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Show Calibration HUD Box
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={bionicReading}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setBionicReading(checked);
                    localStorage.setItem('verbalyst_bionic_reading', checked ? 'true' : 'false');
                  }}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Bionic Reading Mode
              </label>
            </div>
          </div>

          {/* Speech-to-Text configuration */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Sliders size={16} className="text-secondary" />
              <span>Active Speech Engine</span>
            </div>
            <p className="drawer-description">
              Choose your preferred active Speech-to-Text translation engine.
            </p>
            <select
              className="drawer-select"
              value={sttProvider}
              onChange={(e) => {
                const val = e.target.value;
                setSttProvider(val);
                localStorage.setItem('verbalyst_stt_provider', val);
              }}
              style={{ width: '100%', marginTop: '0.25rem' }}
            >
              <option value="native">Web Browser Native API (Unstable on Mobile)</option>
              <option value="puter">Puter.js Speech API</option>
              <option value="groq">Groq Whisper Engine</option>
              <option value="openai">OpenAI Whisper Cloud</option>
              <option value="elevenlabs">ElevenLabs Speech to Text</option>
              <option value="assemblyai">AssemblyAI WebSocket Stream</option>
            </select>
          </div>

          {/* Dedicated API Keys Storage Panel */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Key size={16} className="text-secondary" />
              <span>API Keys Storage</span>
            </div>
            <p className="drawer-description" style={{ marginBottom: '0.75rem' }}>
              Configure keys for your AI services. All keys are stored securely in your browser's local storage.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  GEMINI AI KEY
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Google Gemini Key (gemini-...)"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
                {apiKey ? (
                  <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700, marginTop: '0.25rem', display: 'block' }}>
                    ● Active: Generative Evaluation Enabled
                  </span>
                ) : (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                    ○ Inactive: Local Rule Engine Enabled
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  GEMINI MODEL
                </label>
                <select
                  className="drawer-select"
                  value={geminiModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGeminiModel(val);
                    localStorage.setItem('gemini_model', val);
                  }}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem', background: '#0d121e', color: 'white', border: '1px solid var(--border-light)', borderRadius: '6px' }}
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (Stable Dynamic)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Widely Supported)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Accuracy Reasoning)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Balanced Speed)</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Agentic Coding)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Low Cost)</option>
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Low Latency)</option>
                  <option value="gemini-3-flash">Gemini 3 Flash (Cost Effective)</option>
                  <option value="gemini-2.5-flash-audio">Gemini 2.5 Flash Native Audio Dialog (Native Voice)</option>
                  <option value="gemini-3-flash-live">Gemini 3 Flash Live (Realtime Streaming)</option>
                  <option value="gemma-4-31b-it">Gemma 4 31B (High Reasoning)</option>
                  <option value="gemma-4-26b-a4b-it">Gemma 4 26B MoE (High Throughput)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  GROQ WHISPER KEY
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Groq API Key (gsk_...)"
                  value={sttApiKeys.groq || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newKeys = { ...sttApiKeys, groq: val };
                    setSttApiKeys(newKeys);
                    localStorage.setItem('verbalyst_stt_api_keys', JSON.stringify(newKeys));
                  }}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  OPENAI WHISPER KEY
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="OpenAI API Key (sk-...)"
                  value={sttApiKeys.openai || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newKeys = { ...sttApiKeys, openai: val };
                    setSttApiKeys(newKeys);
                    localStorage.setItem('verbalyst_stt_api_keys', JSON.stringify(newKeys));
                  }}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  ELEVENLABS STT KEY
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="ElevenLabs API Key"
                  value={sttApiKeys.elevenlabs || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newKeys = { ...sttApiKeys, elevenlabs: val };
                    setSttApiKeys(newKeys);
                    localStorage.setItem('verbalyst_stt_api_keys', JSON.stringify(newKeys));
                  }}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  ASSEMBLYAI KEY
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="AssemblyAI API Key"
                  value={sttApiKeys.assemblyai || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newKeys = { ...sttApiKeys, assemblyai: val };
                    setSttApiKeys(newKeys);
                    localStorage.setItem('verbalyst_stt_api_keys', JSON.stringify(newKeys));
                  }}
                  style={{ width: '100%', margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* System info / footer */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>APPLICATION STACK</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>Verbalyst AI Coach v1.2.0</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.5rem' }}>LOGGED IN AS</span>
            <strong style={{ fontSize: '0.8rem', color: 'white' }}>{user.username}</strong>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem('verbalyst_user');
              localStorage.removeItem('verbalyst_login_timestamp');
              setUser(null);
              setSettingsOpen(false);
            }}
            className="btn btn-danger"
            style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            title="Sign Out of Session"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Onboarding tour guide card */}
      {showTour && (
        <div className="glass-panel" style={{ 
          margin: '0 0 1.5rem 0', 
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(6, 182, 212, 0.02))',
          borderColor: 'rgba(139, 92, 246, 0.25)',
          boxShadow: '0 8px 30px rgba(139, 92, 246, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Sparkles size={18} className="text-primary" /> Guided Companion Tour
            </h3>
            <button 
              onClick={dismissTour}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
            >
              Dismiss Tour
            </button>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 1.25rem 0', lineHeight: '1.5' }}>
            Welcome! Verbalyst helps you master high-pressure interviews with real-time feedback. Follow these steps to complete your first session:
          </p>

          <div className="onboarding-grid">
            <div className="step-card">
              <span className="step-card-number">01</span>
              <div className="step-card-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--primary)' }}>
                <Key size={16} />
              </div>
              <h4 style={{ fontSize: '0.85rem', color: 'white', margin: '0 0 4px 0', fontWeight: 700 }}>API Settings</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Click the settings cog in the header to enter your Gemini Key. Local engine runs if left empty.
              </p>
            </div>

            <div className="step-card">
              <span className="step-card-number">02</span>
              <div className="step-card-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--secondary)' }}>
                <Sliders size={16} />
              </div>
              <h4 style={{ fontSize: '0.85rem', color: 'white', margin: '0 0 4px 0', fontWeight: 700 }}>Choose Mode</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Select <strong>Practice Arena</strong> to study specific concepts, or <strong>Full Mock</strong> for a realistic test.
              </p>
            </div>

            <div className="step-card">
              <span className="step-card-number">03</span>
              <div className="step-card-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
                <BookOpen size={16} />
              </div>
              <h4 style={{ fontSize: '0.85rem', color: 'white', margin: '0 0 4px 0', fontWeight: 700 }}>Dictate Response</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Pick a question, click <strong>Start Recording</strong>, and answer aloud. Watch the voice waveform move.
              </p>
            </div>

            <div className="step-card">
              <span className="step-card-number">04</span>
              <div className="step-card-icon" style={{ background: 'rgba(236, 72, 153, 0.15)', color: 'var(--accent)' }}>
                <Sparkles size={16} />
              </div>
              <h4 style={{ fontSize: '0.85rem', color: 'white', margin: '0 0 4px 0', fontWeight: 700 }}>Get AI Grades</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Submit to evaluate grammar tenses, pacing speed (WPM), and key concepts coverage in real-time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className={showSidebar ? "main-grid" : "full-width-layout"} style={{ marginTop: showTour ? '0' : '1rem' }}>
        {/* Left column: Sidebar */}
        {showSidebar && (
          <section>
            {activeTab === 'mock' && mockStatus === 'interview' ? (
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: 'calc(100vh - 8rem)' }}>
                
                {/* Global Time Limit Countdown HUD */}
                <div style={{ 
                  padding: '1.25rem', 
                  textAlign: 'center', 
                  border: '1px solid',
                  borderColor: mockTimeRemaining < 120 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(6, 182, 212, 0.25)',
                  background: mockTimeRemaining < 120 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(6, 182, 212, 0.05)',
                  borderRadius: '16px',
                  boxShadow: mockTimeRemaining < 120 ? '0 0 20px rgba(239, 68, 68, 0.15)' : 'none'
                }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                    Time Remaining
                  </span>
                  <div style={{ 
                    fontSize: '2.25rem', 
                    fontWeight: 800, 
                    color: mockTimeRemaining < 120 ? 'var(--danger)' : 'white',
                    margin: '0.35rem 0',
                    fontFamily: 'monospace',
                    textShadow: mockTimeRemaining < 120 ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none'
                  }}>
                    {formatCountdown(mockTimeRemaining)}
                  </div>
                  <span style={{ fontSize: '0.68rem', color: mockTimeRemaining < 120 ? 'var(--danger)' : 'var(--secondary)', fontWeight: 600 }}>
                    {mockTimeRemaining < 120 ? 'TIME RUNNING OUT' : 'INTERVIEW ACTIVE'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginTop: '0.25rem' }}>
                  <Sparkles size={18} className="text-primary" />
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Mock Timeline</h2>
                </div>

                <div className="timeline-list">
                  {mockQuestions.map((q, idx) => {
                    const isCompleted = idx < currentMockIndex;
                    const isActive = idx === currentMockIndex;
                    // Only render questions that are completed or the active one
                    if (!isCompleted && !isActive) return null;
                    return (
                      <div 
                        key={idx}
                        className="timeline-step-card"
                        style={{
                          borderColor: isActive ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                          background: isActive ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                        }}
                      >
                        <div className={`timeline-step-indicator ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}>
                          {idx + 1}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '0.65rem', color: isActive ? 'var(--primary)' : 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {isActive ? 'ACTIVE QUESTION' : 'COMPLETED'}
                          </span>
                          <p style={{ fontSize: '0.82rem', fontWeight: 500, margin: '2px 0 0 0', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {q.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <QuestionManager 
                activeQuestion={activeQuestion} 
                onSelectQuestion={handleSelectQuestion} 
                questions={questions}
                setQuestions={setQuestions}
                user={user}
              />
            )}
          </section>
        )}

        {/* Right column: Workspace Area */}
        <section className="glass-panel" style={{ minHeight: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'practice' ? (
            assessmentReport ? (
              <AssessmentReport 
                report={assessmentReport} 
                onReset={() => setAssessmentReport(null)} 
              />
            ) : activeQuestion ? (
              <InterviewConsole 
                question={activeQuestion} 
                apiKey={apiKey} 
                geminiModel={geminiModel}
                sttProvider={sttProvider}
                sttApiKey={sttApiKeys[sttProvider] || ''}
                showTimer={showTimer}
                showCalibration={showCalibration}
                bionicReading={bionicReading}
                onSttProviderChange={(provider) => {
                  setSttProvider(provider);
                  localStorage.setItem('verbalyst_stt_provider', provider);
                }}
                onAssessmentComplete={handleAssessmentComplete} 
              />
            ) : (
              <div className="empty-state" style={{ flex: 1 }}>
                <Sparkles size={48} className="text-secondary" />
                <h2 style={{ fontSize: '1.25rem' }}>Start practicing</h2>
                <p style={{ maxWidth: '400px', fontSize: '0.9rem' }}>
                  Select a question from the sidebar bank or dictate a custom question to initiate your interactive practice environment.
                </p>
              </div>
            )
          ) : activeTab === 'mock' ? (
            /* Mock Interview Tabs Workspace */
            <>
              {mockStatus === 'setup' && (
                <MockInterviewSetup 
                  questions={questions} 
                  onStart={handleStartMock} 
                />
              )}
              {mockStatus === 'interview' && (
                <InterviewConsole 
                  question={mockQuestions[currentMockIndex]} 
                  apiKey={apiKey} 
                  geminiModel={geminiModel}
                  sttProvider={sttProvider}
                  sttApiKey={sttApiKeys[sttProvider] || ''}
                  showTimer={showTimer}
                  showCalibration={showCalibration}
                  bionicReading={bionicReading}
                  onSttProviderChange={(provider) => {
                    setSttProvider(provider);
                    localStorage.setItem('verbalyst_stt_provider', provider);
                  }}
                  isMockMode={true}
                  currentMockIndex={currentMockIndex}
                  totalMockQuestions={mockQuestions.length}
                  onNextQuestion={handleNextMockQuestion}
                  onCancelMock={handleCancelMock}
                  onTranscriptChange={(text) => { currentAnswerRef.current.transcript = text; }}
                  onTimeChange={(sec) => { currentAnswerRef.current.elapsedTime = sec; }}
                  onBreaksChange={(cnt) => { currentAnswerRef.current.breaksCount = cnt; }}
                />
              )}
              {mockStatus === 'analyzing' && (
                <div className="empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                  <RefreshCw size={48} className="text-primary animate-spin" />
                  <h2 style={{ fontSize: '1.25rem' }}>Evaluating Interview...</h2>
                  <p style={{ maxWidth: '400px', fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Generating overall assessment, detailed grammar audits, and conceptual technical review. This may take a moment.
                  </p>
                </div>
              )}
              {mockStatus === 'report' && (
                <MockInterviewReport 
                  report={mockReport} 
                  onReset={handleCancelMock} 
                />
              )}
            </>
          ) : activeTab === 'realtime-mock' ? (
            <RealtimeMock 
              questions={questions} 
              apiKey={apiKey} 
              geminiModel={geminiModel} 
              user={user}
              onSaveReport={(report) => saveReportWithBackupQueue(report, 'realtime')}
            />
          ) : (
            <HistoryView user={user} />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
