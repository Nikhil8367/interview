import React, { useState, useEffect, useRef } from 'react';
import { Play, Mic, MicOff, Plus, Trash2, BookOpen, Upload, Share2, Edit, Search, Check, X, Inbox } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs, updateDoc, getDoc, writeBatch, onSnapshot } from 'firebase/firestore';

export const PRESETS = [
  {
    id: 'react-vdom',
    category: 'Frontend Development',
    text: 'Explain the difference between the Virtual DOM and the real DOM in React, and why it improves performance.',
    keywords: ['Virtual DOM', 'reconciliation', 'diffing', 'browser DOM', 'batching', 'paint'],
    suggestedAnswer: 'The real DOM represents the UI as a tree structure. Updating it directly is slow because it triggers layout recalculations and repaints. React’s Virtual DOM is a lightweight JavaScript representation of the real DOM. When state changes, React updates the Virtual DOM first, compares it with the previous snapshot using a diffing algorithm (Reconciliation), and batches updates to write only the differences to the real DOM, minimizing costly browser reflows.'
  },
  {
    id: 'db-deadlock',
    category: 'System & Database',
    text: 'What is a deadlock in Database management systems? Explain the conditions for it and how we can prevent it.',
    keywords: ['deadlock', 'circular wait', 'mutual exclusion', 'hold and wait', 'lock', 'rollback'],
    suggestedAnswer: 'A deadlock is a state where two or more transactions are blocked because each holds a lock that the other needs, creating a cycle. The four Coffman conditions for deadlocks are mutual exclusion, hold and wait, no preemption, and circular wait. Prevention strategies include ordering resource acquisition globally, using wait-die or wound-wait preemptive schemes, setting lock timeout limits, or executing deadlock detection algorithms and rolling back one transaction.'
  },
  {
    id: 'api-rest',
    category: 'Web Services',
    text: 'Describe the principles of REST architecture. Specifically, explain what statelessness means in this context.',
    keywords: ['REST', 'stateless', 'HTTP', 'client-server', 'resource', 'cacheable', 'payload'],
    suggestedAnswer: 'REST principles include client-server separation, a uniform interface (URIs, HTTP verbs), statelessness, cacheability, and layered systems. Statelessness means that the server stores no context about the client session. Every incoming HTTP request must contain all the information necessary to understand and process the request (e.g. auth tokens, query params, headers). This improves server scalability and routing flexibility.'
  },
  {
    id: 'https-sec',
    category: 'Computer Networks',
    text: 'How does HTTPS establish a secure connection between a browser and a server? Walk through the handshake process.',
    keywords: ['HTTPS', 'SSL', 'TLS', 'handshake', 'symmetric key', 'asymmetric', 'certificate authority', 'public key'],
    suggestedAnswer: 'HTTPS combines HTTP with SSL/TLS encryption. During the handshake: 1. The client sends a ClientHello with supported cipher suites. 2. The server responds with ServerHello and its digital certificate (containing its public key). 3. The client verifies the certificate with trusted root Certificate Authorities (CAs). 4. The client generates a random Pre-Master Secret, encrypts it with the server’s public key, and sends it to the server (asymmetric encryption). 5. Both derive the Master Secret to generate symmetric session keys for subsequent message encryption.'
  },
  {
    id: 'hr-conflict',
    category: 'Behavioral',
    text: 'Tell me about a time you disagreed with a technical design choice made by a teammate. How did you resolve it?',
    keywords: ['disagreement', 'compromise', 'collaboration', 'constructive feedback', 'empathy', 'alignment'],
    suggestedAnswer: 'A successful behavioral response uses the STAR method: 1. Situation: outline a disagreement over an architecture (e.g., GraphQL vs REST). 2. Task: describe the need to resolve it without harming team cohesion. 3. Action: set up an objective comparison matrix, schedule a collaborative review, seek compromises, and gather data. 4. Result: describe the selected option, project success, team alignment, and how relationship trust was preserved.'
  }
];

export default function QuestionManager({ 
  activeQuestion, 
  onSelectQuestion,
  questions,
  setQuestions,
  user,
  onReloadQuestions
}) {

  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('Frontend Development');
  const [newKeywords, setNewKeywords] = useState('');
  const [newSuggestedAnswer, setNewSuggestedAnswer] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Pending shares states
  const [incomingShares, setIncomingShares] = useState([]);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // Bulk selection states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [sharingStatus, setSharingStatus] = useState({}); // { [questionId]: 'idle' | 'sending' | 'success' | 'failed' }

  const toggleSelectQuestion = (qId) => {
    setSelectedQuestionIds(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const handleSelectAll = () => {
    const selectableIds = questions.filter(q => !q.isShared).map(q => q.id);
    setSelectedQuestionIds(selectableIds);
  };

  const handleSelectOpposite = () => {
    const selectableQuestions = questions.filter(q => !q.isShared);
    const newSelection = selectableQuestions
      .filter(q => !selectedQuestionIds.includes(q.id))
      .map(q => q.id);
    setSelectedQuestionIds(newSelection);
  };

  const handleStartBulkShare = () => {
    if (selectedQuestionIds.length === 0) return;
    setShareTargetQuestion(null);
    setIsShareModalOpen(true);
    setSearchUsername('');
    setSearchResultUser(null);
    setSearchError('');
    setShareSuccessMessage('');
  };

  // Sharing modal states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareTargetQuestion, setShareTargetQuestion] = useState(null);
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResultUser, setSearchResultUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [shareSuccessMessage, setShareSuccessMessage] = useState('');

  // Editing states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('Frontend Development');
  const [editKeywords, setEditKeywords] = useState('');
  const [editSuggestedAnswer, setEditSuggestedAnswer] = useState('');
  const [editError, setEditError] = useState('');

  // Load pending shares in real-time
  const loadShares = async () => {
    // No-op because the real-time listener handles state updates automatically.
  };

  useEffect(() => {
    if (!user) return;
    setLoadingShares(true);

    const incomingQ = query(
      collection(db, 'shares'), 
      where('receiverId', '==', user.id), 
      where('status', '==', 'pending')
    );
    const unsubscribeIncoming = onSnapshot(incomingQ, (incomingSnap) => {
      setIncomingShares(incomingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingShares(false);
    }, (err) => {
      console.error("Error listening to incoming shares:", err);
      setLoadingShares(false);
    });

    const outgoingQ = query(
      collection(db, 'shares'), 
      where('senderId', '==', user.id), 
      where('status', '==', 'pending')
    );
    const unsubscribeOutgoing = onSnapshot(outgoingQ, (outgoingSnap) => {
      setOutgoingShares(outgoingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Error listening to outgoing shares:", err);
    });

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [user]);

  const handleSearchUser = async () => {
    if (!searchUsername.trim()) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResultUser(null);
    try {
      const q = query(
        collection(db, 'users'), 
        where('usernameNormalized', '==', searchUsername.trim().toLowerCase())
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setSearchError('User not found.');
      } else {
        const foundUser = snapshot.docs[0].data();
        if (foundUser.id === user.id) {
          setSearchError('You cannot share a question with yourself.');
        } else {
          setSearchResultUser(foundUser);
        }
      }
    } catch (err) {
      console.error("Error searching user:", err);
      setSearchError('Error searching for user.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendShareRequest = async () => {
    if (!searchResultUser) return;
    if (!isSelectMode && !shareTargetQuestion) return;
    if (isSelectMode && selectedQuestionIds.length === 0) return;

    const questionsToShare = isSelectMode
      ? questions.filter(q => selectedQuestionIds.includes(q.id))
      : [shareTargetQuestion];

    const initialStatus = {};
    questionsToShare.forEach(q => {
      initialStatus[q.id] = 'sending';
    });
    setSharingStatus(initialStatus);
    setShareSuccessMessage('');

    try {
      if (isSelectMode) {
        const batch = writeBatch(db);
        for (const q of questionsToShare) {
          const shareId = `${searchResultUser.id}_${q.id}`;
          batch.set(doc(db, 'shares', shareId), {
            id: shareId,
            questionId: q.id,
            questionText: q.text,
            senderId: user.id,
            senderUsername: user.username,
            receiverId: searchResultUser.id,
            receiverUsername: searchResultUser.username,
            status: 'pending',
            createdAt: new Date().toISOString()
          });
        }
        await batch.commit();
      } else {
        const q = shareTargetQuestion;
        const shareId = `${searchResultUser.id}_${q.id}`;
        await setDoc(doc(db, 'shares', shareId), {
          id: shareId,
          questionId: q.id,
          questionText: q.text,
          senderId: user.id,
          senderUsername: user.username,
          receiverId: searchResultUser.id,
          receiverUsername: searchResultUser.username,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      const successStatus = {};
      questionsToShare.forEach(q => {
        successStatus[q.id] = 'success';
      });
      setSharingStatus(successStatus);
      setShareSuccessMessage(
        isSelectMode
          ? `Successfully sent sharing requests for ${questionsToShare.length} questions to @${searchResultUser.username}!`
          : `Successfully sent sharing request to @${searchResultUser.username}!`
      );

      loadShares();
      setTimeout(() => {
        setIsShareModalOpen(false);
        setShareSuccessMessage('');
        setSearchResultUser(null);
        setSearchUsername('');
        setSharingStatus({});
        if (isSelectMode) {
          setIsSelectMode(false);
          setSelectedQuestionIds([]);
        }
      }, 2500);
    } catch (err) {
      console.error("Error sending share request:", err);
      const failStatus = {};
      questionsToShare.forEach(q => {
        failStatus[q.id] = 'failed';
      });
      setSharingStatus(failStatus);
      alert("Failed to send sharing request: " + err.message);
    }
  };

  const handleAcceptShares = async (sharesArray) => {
    try {
      const batch = writeBatch(db);
      sharesArray.forEach(share => {
        batch.update(doc(db, 'shares', share.id), { status: 'accepted' });
      });
      await batch.commit();
      await loadShares();
      if (onReloadQuestions) {
        await onReloadQuestions();
      }
    } catch (err) {
      console.error("Error accepting shares:", err);
      alert("Failed to accept request(s): " + err.message);
    }
  };

  const handleDeclineShares = async (sharesArray) => {
    try {
      const batch = writeBatch(db);
      sharesArray.forEach(share => {
        batch.delete(doc(db, 'shares', share.id));
      });
      await batch.commit();
      await loadShares();
      if (onReloadQuestions) {
        await onReloadQuestions();
      }
    } catch (err) {
      console.error("Error declining/cancelling shares:", err);
      alert("Failed to decline/cancel request(s): " + err.message);
    }
  };


  const handleStartShare = (q, e) => {
    e.stopPropagation();
    setIsSelectMode(false);
    setSelectedQuestionIds([]);
    setShareTargetQuestion(q);
    setIsShareModalOpen(true);
    setSearchUsername('');
    setSearchResultUser(null);
    setSearchError('');
    setShareSuccessMessage('');
  };

  const handleStartEdit = (q, e) => {
    e.stopPropagation();
    setEditTargetQuestion(q);
    setEditText(q.text);
    setEditCategory(q.category);
    setEditKeywords(q.keywords.join(', '));
    setEditSuggestedAnswer(q.suggestedAnswer || '');
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditQuestion = async (e) => {
    e.preventDefault();
    if (!editText.trim()) return;

    const keywordsArray = editKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    try {
      if (editTargetQuestion.isShared) {
        if (editText.trim() !== editTargetQuestion.text) {
          // Fork on modify
          const newQId = `custom-fork-${Date.now()}`;
          await setDoc(doc(db, 'questions', newQId), {
            id: newQId,
            userId: user.id,
            text: editText.trim(),
            category: editCategory,
            keywords: keywordsArray,
            suggestedAnswer: editSuggestedAnswer.trim()
          });

          // Delete share
          const shareId = `${user.id}_${editTargetQuestion.id}`;
          await deleteDoc(doc(db, 'shares', shareId));
          alert("This shared question's text was updated. A separate copy has been created in your question bank.");
        } else {
          // Update shared question content collaboratively
          const qRef = doc(db, 'questions', editTargetQuestion.id);
          await updateDoc(qRef, {
            category: editCategory,
            keywords: keywordsArray,
            suggestedAnswer: editSuggestedAnswer.trim()
          });
          alert("Shared question updated collaboratively.");
        }
      } else {
        // Update owned question directly
        const qRef = doc(db, 'questions', editTargetQuestion.id);
        await updateDoc(qRef, {
          text: editText.trim(),
          category: editCategory,
          keywords: keywordsArray,
          suggestedAnswer: editSuggestedAnswer.trim()
        });
      }

      setIsEditModalOpen(false);
      setEditTargetQuestion(null);
      if (onReloadQuestions) {
        await onReloadQuestions();
      }
    } catch (err) {
      console.error("Error editing question:", err);
      setEditError("Failed to edit question: " + err.message);
    }
  };

  // Initialize Speech Recognition for Adding Questions
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setNewText(prev => (prev ? prev + ' ' : '') + transcript);
        setIsVoiceRecording(false);
      };

      rec.onerror = (err) => {
        console.error('Speech recognition error in creator:', err);
        setIsVoiceRecording(false);
      };

      rec.onend = () => {
        setIsVoiceRecording(false);
      };

      setRecognition(rec);
    }
  }, []);

  const saveQuestions = async (updated) => {
    if (!user) return;
    
    // Detect additions (new items)
    const added = updated.filter(q => !questions.some(prev => prev.id === q.id));

    // Handle additions
    for (const q of added) {
      try {
        const qId = q.id || `custom-${Date.now()}`;
        await setDoc(doc(db, 'questions', qId), {
          id: qId,
          userId: user.id,
          text: q.text,
          category: q.category,
          keywords: Array.isArray(q.keywords) ? q.keywords : [],
          suggestedAnswer: q.suggestedAnswer || ''
        });
      } catch (err) {
        console.error("Error adding question:", err);
      }
    }

    if (onReloadQuestions) {
      await onReloadQuestions();
    }
  };

  const handleVoiceInput = () => {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }

    if (isVoiceRecording) {
      recognition.stop();
    } else {
      setIsVoiceRecording(true);
      recognition.start();
    }
  };

  const handleAddQuestion = (e) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const keywordsArray = newKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const question = {
      id: `custom-${Date.now()}`,
      category: newCategory,
      text: newText.trim(),
      keywords: keywordsArray.length > 0 ? keywordsArray : ['explanation'],
      suggestedAnswer: newSuggestedAnswer.trim() || undefined
    };

    const updated = [...questions, question];
    saveQuestions(updated);
    
    onSelectQuestion(question);

    setNewText('');
    setNewKeywords('');
    setNewSuggestedAnswer('');
    setShowAddForm(false);
  };

  const handleDeleteQuestion = async (id, e) => {
    e.stopPropagation();
    
    const targetQ = questions.find(q => q.id === id);
    if (!targetQ) return;

    if (window.confirm("Are you sure you want to remove this question?")) {
      try {
        if (targetQ.isShared) {
          const shareId = `${user.id}_${targetQ.id}`;
          await deleteDoc(doc(db, 'shares', shareId));
        } else {
          await deleteDoc(doc(db, 'questions', targetQ.id));
          
          const sharesQ = query(collection(db, 'shares'), where('questionId', '==', targetQ.id));
          const sharesSnap = await getDocs(sharesQ);
          for (const sDoc of sharesSnap.docs) {
            await deleteDoc(sDoc.ref);
          }
        }
        
        if (onReloadQuestions) {
          await onReloadQuestions();
        }
      } catch (err) {
        console.error("Error removing question:", err);
        alert("Failed to remove question: " + err.message);
      }
    }
  };

  const handleResetPresets = async () => {
    if (window.confirm("Are you sure you want to restore default preset questions? This will delete custom questions and restore defaults.")) {
      try {
        const owned = questions.filter(q => !q.isShared);
        for (const q of owned) {
          await deleteDoc(doc(db, 'questions', q.id));
          const sharesQ = query(collection(db, 'shares'), where('questionId', '==', q.id));
          const sharesSnap = await getDocs(sharesQ);
          for (const sDoc of sharesSnap.docs) {
            await deleteDoc(sDoc.ref);
          }
        }
        
        for (const p of PRESETS) {
          const qId = `q_${p.id}_${user.id}`;
          await setDoc(doc(db, 'questions', qId), {
            ...p,
            id: qId,
            userId: user.id
          });
        }
        
        if (onReloadQuestions) {
          await onReloadQuestions();
        }
      } catch (err) {
        console.error("Error resetting presets:", err);
        alert("Failed to reset presets: " + err.message);
      }
    }
  };
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        let importedQuestions = [];

        if (file.name.toLowerCase().endsWith('.json')) {
          let parsed = JSON.parse(content);
          if (parsed && !Array.isArray(parsed)) {
            if (Array.isArray(parsed.questions)) {
              parsed = parsed.questions;
            } else if (Array.isArray(parsed.data)) {
              parsed = parsed.data;
            }
          }
          const rawList = Array.isArray(parsed) ? parsed : [parsed];
          
          rawList.forEach((item, index) => {
            if (typeof item === 'string') {
              importedQuestions.push({
                id: `custom-import-${Date.now()}-${index}`,
                category: 'Imported',
                text: item.trim(),
                keywords: ['explanation']
              });
            } else if (item && typeof item === 'object') {
              const text = item.text || item.question || '';
              if (text) {
                let kws = item.keywords || [];
                if (typeof kws === 'string') {
                  kws = kws.split(',').map(k => k.trim()).filter(Boolean);
                }
                importedQuestions.push({
                  id: `custom-import-${Date.now()}-${index}`,
                  category: item.category || 'Imported',
                  text: text.trim(),
                  keywords: kws.length > 0 ? kws : ['explanation'],
                  suggestedAnswer: item.suggestedAnswer || item.answer || undefined
                });
              }
            }
          });
        } else {
          // TXT file parsing: each non-empty line is a question
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed) {
              importedQuestions.push({
                id: `custom-import-${Date.now()}-${index}`,
                category: 'Imported',
                text: trimmed,
                keywords: ['explanation']
              });
            }
          });
        }

        if (importedQuestions.length === 0) {
          alert('No valid questions found in the file.');
          return;
        }

        const updated = [...questions, ...importedQuestions];
        saveQuestions(updated);
        
        // Select the first imported question
        onSelectQuestion(importedQuestions[0]);
        alert(`Successfully imported ${importedQuestions.length} question(s)!`);
      } catch (err) {
        console.error('File parsing error:', err);
        alert('Failed to parse file. Please verify it is a valid TXT or JSON format.');
      }
      
      // Reset input value
      if (e.target) e.target.value = '';
    };

    reader.readAsText(file);
  };


  // Group incoming shares by sender
  const incomingGroups = incomingShares.reduce((groups, share) => {
    const key = share.senderId;
    if (!groups[key]) {
      groups[key] = {
        senderId: share.senderId,
        senderUsername: share.senderUsername,
        shares: []
      };
    }
    groups[key].shares.push(share);
    return groups;
  }, {});
  const incomingGroupsList = Object.values(incomingGroups);

  // Group outgoing shares by receiver
  const outgoingGroups = outgoingShares.reduce((groups, share) => {
    const key = share.receiverId;
    if (!groups[key]) {
      groups[key] = {
        receiverId: share.receiverId,
        receiverUsername: share.receiverUsername,
        shares: []
      };
    }
    groups[key].shares.push(share);
    return groups;
  }, {});
  const outgoingGroupsList = Object.values(outgoingGroups);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={20} className="text-secondary" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Question Bank</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedQuestionIds([]);
            }}
            style={{
              fontSize: '0.75rem',
              background: 'none',
              border: 'none',
              color: isSelectMode ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: 0
            }}
          >
            {isSelectMode ? 'Exit Selection' : 'Select Questions'}
          </button>
          <span style={{ color: 'var(--border-light)', fontSize: '0.8rem' }}>|</span>
          <button 
            type="button" 
            onClick={handleResetPresets}
            style={{ 
              fontSize: '0.75rem', 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer', 
              textDecoration: 'underline',
              fontWeight: 600,
              padding: 0
            }}
            title="Restore default questions"
          >
            Reset Presets
          </button>
        </div>
      </div>

      {/* Pending Share Requests Panel */}
      {(incomingShares.length > 0 || outgoingShares.length > 0) && (
        <div style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          margin: '0.75rem 0',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--text-color)', fontWeight: 700 }}>
            <Inbox size={15} className="text-primary" />
            <span>Pending Share Requests</span>
          </div>

          {/* Incoming share requests grouped by sender */}
          {incomingGroupsList.map(group => (
            <div key={group.senderId} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              padding: '0.5rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              marginBottom: '0.5rem'
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>
                Incoming from <strong style={{ color: 'var(--text-color)' }}>@{group.senderUsername}</strong> ({group.shares.length} {group.shares.length === 1 ? 'question' : 'questions'})
              </div>
              <div style={{ maxHeight: '100px', overflowY: 'auto', margin: '0.2rem 0', paddingLeft: '0.4rem', borderLeft: '2px solid rgba(139, 92, 246, 0.3)' }}>
                {group.shares.map(s => (
                  <p key={s.id} style={{ margin: '0.2rem 0', fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.questionText}>
                    • "{s.questionText}"
                  </p>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => handleAcceptShares(group.shares)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontSize: '0.72rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  <Check size={12} /> Accept All
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclineShares(group.shares)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontSize: '0.72rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  <X size={12} /> Decline All
                </button>
              </div>
            </div>
          ))}

          {/* Outgoing share requests grouped by receiver */}
          {outgoingGroupsList.map(group => (
            <div key={group.receiverId} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              padding: '0.5rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              marginBottom: '0.5rem'
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>
                Sent to <strong style={{ color: 'var(--text-color)' }}>@{group.receiverUsername}</strong> (Pending {group.shares.length} {group.shares.length === 1 ? 'question' : 'questions'})
              </div>
              <div style={{ maxHeight: '100px', overflowY: 'auto', margin: '0.2rem 0', paddingLeft: '0.4rem', borderLeft: '2px solid rgba(255, 255, 255, 0.1)' }}>
                {group.shares.map(s => (
                  <p key={s.id} style={{ margin: '0.2rem 0', fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.questionText}>
                    • "{s.questionText}"
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleDeclineShares(group.shares)}
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  fontSize: '0.72rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                <X size={12} /> Cancel All
              </button>
            </div>
          ))}
        </div>
      )}

      {isSelectMode && (
        <div style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          margin: '0.5rem 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>
              {selectedQuestionIds.length} selected
            </span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  fontSize: '0.7rem',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'var(--text-color)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleSelectOpposite}
                style={{
                  fontSize: '0.7rem',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'var(--text-color)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
                title="Select opposite / invert selection"
              >
                Opposite
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleStartBulkShare}
              disabled={selectedQuestionIds.length === 0}
              className="btn btn-primary"
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                height: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                opacity: selectedQuestionIds.length === 0 ? 0.5 : 1,
                cursor: selectedQuestionIds.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <Share2 size={13} /> Share Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedQuestionIds([])}
              disabled={selectedQuestionIds.length === 0}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                height: 'auto',
                opacity: selectedQuestionIds.length === 0 ? 0.5 : 1,
                cursor: selectedQuestionIds.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="questions-list" style={{ flex: 1 }}>
        {questions.map((q) => {
          const isSelected = selectedQuestionIds.includes(q.id);
          const canSelect = !q.isShared;

          return (
            <div 
              key={q.id} 
              className={`glass-card question-item ${activeQuestion?.id === q.id && !isSelectMode ? 'active' : ''} ${isSelectMode && isSelected ? 'selected-item' : ''}`}
              onClick={() => {
                if (isSelectMode) {
                  if (canSelect) {
                    toggleSelectQuestion(q.id);
                  }
                } else {
                  onSelectQuestion(q);
                }
              }}
              style={{
                cursor: isSelectMode && !canSelect ? 'not-allowed' : 'pointer',
                opacity: isSelectMode && !canSelect ? 0.5 : 1,
                border: isSelectMode && isSelected ? '1px solid var(--primary)' : undefined,
                background: isSelectMode && isSelected ? 'rgba(139, 92, 246, 0.04)' : undefined
              }}
            >
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {isSelectMode && canSelect && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectQuestion(q.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '0.25rem',
                      cursor: 'pointer',
                      accentColor: 'var(--primary)',
                      width: '15px',
                      height: '15px',
                      flexShrink: 0
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="question-header">
                    <span className="category-tag">
                      {q.category} {q.isShared && `(Shared by @${q.sharedBy})`}
                    </span>
                    {!isSelectMode && (
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <button
                          onClick={(e) => handleStartEdit(q, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '0.2rem',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Edit question"
                        >
                          <Edit size={13} />
                        </button>
                        {!q.isShared && (
                          <button
                            onClick={(e) => handleStartShare(q, e)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '0.2rem',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Share question"
                          >
                            <Share2 size={13} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => handleDeleteQuestion(q.id, e)}
                          className="delete-question-btn"
                          title={q.isShared ? "Remove share" : "Delete question"}
                          style={{ margin: 0, padding: '0.2rem' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="question-text" style={{ margin: '0.5rem 0' }}>{q.text}</p>
                  <div className="question-keywords">
                    {q.keywords.map((kw, i) => (
                      <span key={i} className="keyword-tag">{kw}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".txt,.json" 
        style={{ display: 'none' }} 
      />

      {!showAddForm ? (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
          <button 
            type="button"
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary"
            style={{ flex: 1, display: 'flex', gap: '0.4rem', fontSize: '0.82rem', height: '2.4rem', padding: 0 }}
          >
            <Plus size={15} /> Add Question
          </button>
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
            style={{ flex: 1, display: 'flex', gap: '0.4rem', fontSize: '0.82rem', height: '2.4rem', padding: 0 }}
          >
            <Upload size={14} /> Import TXT/JSON
          </button>
        </div>
      ) : (
        <form className="add-question-box" onSubmit={handleAddQuestion} style={{ animation: 'fadeIn 0.25s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Add New Question</h3>
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="btn btn-secondary"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', height: 'auto', borderRadius: '4px' }}
            >
              Cancel
            </button>
          </div>
          
          <div className="input-group">
            <label className="input-label">Category</label>
            <select 
              className="drawer-select" 
              value={newCategory} 
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.82rem' }}
            >
              <option value="Frontend Development">Frontend Development</option>
              <option value="Backend Development">Backend Development</option>
              <option value="System & Database">System & Database</option>
              <option value="Web Services">Web Services</option>
              <option value="Computer Networks">Computer Networks</option>
              <option value="Behavioral">Behavioral</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Question Text</label>
            <div className="voice-input-row" style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="input-field"
                placeholder="Ask via typing or voice..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                required
                style={{ flex: 1, margin: 0 }}
              />
              <button 
                type="button" 
                className={`btn btn-secondary btn-icon ${isVoiceRecording ? 'btn-danger animate-pulse' : ''}`}
                onClick={handleVoiceInput}
                title={isVoiceRecording ? "Stop dictation" : "Dictate question"}
                style={{ width: '2.5rem', height: '2.5rem', flexShrink: 0 }}
              >
                {isVoiceRecording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Key Concepts (Comma separated)</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="e.g. Virtual DOM, diffing, batching"
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              style={{ margin: 0 }}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Suggested Answer / Key Points (Optional)</label>
            <textarea 
              className="input-field"
              placeholder="Provide a target answer or key concepts to evaluate response accuracy against..."
              value={newSuggestedAnswer}
              onChange={(e) => setNewSuggestedAnswer(e.target.value)}
              style={{ minHeight: '60px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem', margin: 0 }}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <Plus size={16} /> Save Question
          </button>
        </form>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (shareTargetQuestion || (isSelectMode && selectedQuestionIds.length > 0)) && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '1.5rem',
            border: '1px solid var(--border-light)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-color)' }}>
                <Share2 size={18} className="text-secondary" /> {isSelectMode ? 'Share Selected Questions' : 'Share Question'}
              </h3>
              <button 
                onClick={() => {
                  setIsShareModalOpen(false);
                  setSharingStatus({});
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ 
              fontSize: '0.85rem', 
              color: 'var(--text-muted)', 
              padding: '0.5rem 0.75rem', 
              borderRadius: '6px', 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid rgba(255,255,255,0.04)',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              <strong>Selected Questions to Share ({isSelectMode ? selectedQuestionIds.length : 1}):</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                {isSelectMode ? (
                  questions
                    .filter(q => selectedQuestionIds.includes(q.id))
                    .map(q => {
                      const status = sharingStatus[q.id] || 'idle';
                      return (
                        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                            • "{q.text}"
                          </p>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 600, 
                            color: status === 'success' ? '#4ade80' : status === 'failed' ? '#f87171' : status === 'sending' ? 'var(--primary)' : 'var(--text-muted)',
                            flexShrink: 0
                          }}>
                            {status === 'success' && '✓ Sent'}
                            {status === 'failed' && '✗ Failed'}
                            {status === 'sending' && 'Sending...'}
                            {status === 'idle' && 'Ready'}
                          </span>
                        </div>
                      );
                    })
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-color)', flex: 1 }}>
                      "{shareTargetQuestion?.text}"
                    </p>
                    {shareTargetQuestion && (
                      <span style={{ 
                        fontSize: '0.72rem', 
                        fontWeight: 600, 
                        color: (sharingStatus[shareTargetQuestion.id] || 'idle') === 'success' ? '#4ade80' : (sharingStatus[shareTargetQuestion.id] || 'idle') === 'failed' ? '#f87171' : (sharingStatus[shareTargetQuestion.id] || 'idle') === 'sending' ? 'var(--primary)' : 'var(--text-muted)',
                        flexShrink: 0
                      }}>
                        {(sharingStatus[shareTargetQuestion.id] || 'idle') === 'success' && '✓ Sent'}
                        {(sharingStatus[shareTargetQuestion.id] || 'idle') === 'failed' && '✗ Failed'}
                        {(sharingStatus[shareTargetQuestion.id] || 'idle') === 'sending' && 'Sending...'}
                        {(sharingStatus[shareTargetQuestion.id] || 'idle') === 'idle' && 'Ready'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Find Peer by Username</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text"
                  placeholder="Enter exact username..."
                  className="input-field"
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  style={{ flex: 1, margin: 0 }}
                />
                <button
                  type="button"
                  onClick={handleSearchUser}
                  disabled={searchLoading}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', height: '2.5rem', flexShrink: 0 }}
                >
                  <Search size={14} /> Search
                </button>
              </div>
            </div>

            {searchError && (
              <div style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 500 }}>
                {searchError}
              </div>
            )}

            {searchResultUser && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(14, 165, 233, 0.08)',
                border: '1px solid rgba(14, 165, 233, 0.2)'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-color)' }}>@{searchResultUser.username}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Normalized: {searchResultUser.usernameNormalized}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSendShareRequest}
                  className="btn btn-primary"
                  style={{ fontSize: '0.75rem', height: '2.2rem', padding: '0 0.75rem' }}
                >
                  Send Invite
                </button>
              </div>
            )}

            {shareSuccessMessage && (
              <div style={{ color: '#4ade80', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', padding: '0.25rem' }}>
                {shareSuccessMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editTargetQuestion && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <form onSubmit={handleEditQuestion} className="glass-panel" style={{
            width: '90%',
            maxWidth: '500px',
            padding: '1.5rem',
            border: '1px solid var(--border-light)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-color)' }}>
                <Edit size={18} className="text-secondary" /> Edit Question
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditTargetQuestion(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {editTargetQuestion.isShared && (
              <div style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.2)',
                fontSize: '0.78rem',
                color: '#facc15',
                lineHeight: '1.3'
              }}>
                <strong>Shared Question Notice:</strong> Changing the question text will automatically fork this question into your private list, ending the sharing agreement. Editing other fields (Category, Concepts, Answer) will update it collaboratively.
              </div>
            )}

            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Category</label>
              <select 
                className="drawer-select" 
                value={editCategory} 
                onChange={(e) => setEditCategory(e.target.value)}
                style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.82rem' }}
              >
                <option value="Frontend Development">Frontend Development</option>
                <option value="Backend Development">Backend Development</option>
                <option value="System & Database">System & Database</option>
                <option value="Web Services">Web Services</option>
                <option value="Computer Networks">Computer Networks</option>
                <option value="Behavioral">Behavioral</option>
              </select>
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Question Text</label>
              <input 
                type="text" 
                className="input-field"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                required
                style={{ width: '100%', margin: 0 }}
              />
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Key Concepts (Comma separated)</label>
              <input 
                type="text" 
                className="input-field"
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                style={{ width: '100%', margin: 0 }}
              />
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Suggested Answer / Key Points (Optional)</label>
              <textarea 
                className="input-field"
                value={editSuggestedAnswer}
                onChange={(e) => setEditSuggestedAnswer(e.target.value)}
                style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem', margin: 0 }}
              />
            </div>

            {editError && (
              <div style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 500 }}>
                {editError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Save Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
