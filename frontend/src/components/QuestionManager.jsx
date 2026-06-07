import React, { useState, useEffect, useRef } from 'react';
import { Play, Mic, MicOff, Plus, Trash2, BookOpen, Upload } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
  user
}) {

  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('Frontend Development');
  const [newKeywords, setNewKeywords] = useState('');
  const [newSuggestedAnswer, setNewSuggestedAnswer] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

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
    
    // 1. Detect additions (new items)
    const added = updated.filter(q => !questions.some(prev => prev.id === q.id));
    // 2. Detect deletions
    const deleted = questions.filter(q => !updated.some(next => next.id === q.id));

    // Handle deletions
    for (const q of deleted) {
      try {
        await deleteDoc(doc(db, 'questions', q.id));
      } catch (err) {
        console.error("Error deleting question:", err);
      }
    }

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

    // Reload the full fresh set from firestore
    try {
      const q = query(collection(db, 'questions'), where('userId', '==', user.id));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuestions(data);
    } catch (err) {
      console.error("Error reloading questions from firestore:", err);
      setQuestions(updated);
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
    
    // Select the new question immediately
    onSelectQuestion(question);

    // Reset fields
    setNewText('');
    setNewKeywords('');
    setNewSuggestedAnswer('');
    setShowAddForm(false);
  };

  const handleDeleteQuestion = (id, e) => {
    e.stopPropagation(); // prevent select trigger
    const updated = questions.filter(q => q.id !== id);
    saveQuestions(updated);

    if (activeQuestion && activeQuestion.id === id) {
      onSelectQuestion(updated.length > 0 ? updated[0] : null);
    }
  };

  const handleResetPresets = () => {
    if (window.confirm("Are you sure you want to restore the default preset questions? This will overwrite your current list.")) {
      saveQuestions(PRESETS);
      onSelectQuestion(PRESETS[0]);
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

  // Set default active question if none selected
  useEffect(() => {
    if (!activeQuestion && questions.length > 0) {
      onSelectQuestion(questions[0]);
    }
  }, [questions, activeQuestion, onSelectQuestion]);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={20} className="text-secondary" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Question Bank</h2>
        </div>
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

      <div className="questions-list" style={{ flex: 1 }}>
        {questions.map((q) => (
          <div 
            key={q.id} 
            className={`glass-card question-item ${activeQuestion?.id === q.id ? 'active' : ''}`}
            onClick={() => onSelectQuestion(q)}
          >
            <div className="question-header">
              <span className="category-tag">{q.category}</span>
              <button 
                onClick={(e) => handleDeleteQuestion(q.id, e)}
                className="delete-question-btn"
                title="Delete question"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <p className="question-text">{q.text}</p>
            <div className="question-keywords">
              {q.keywords.map((kw, i) => (
                <span key={i} className="keyword-tag">{kw}</span>
              ))}
            </div>
          </div>
        ))}
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
    </div>
  );
}
