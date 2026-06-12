import React, { useState } from 'react';
import { Settings, Play, CheckSquare, Square, HelpCircle } from 'lucide-react';

const TOPICS = [
  { id: 'DSA', name: 'DSA', desc: 'Data Structures & Algorithms' },
  { id: 'OOP', name: 'OOP', desc: 'Object-Oriented Programming' },
  { id: 'DBMS', name: 'DBMS', desc: 'Database Systems' },
  { id: 'OS', name: 'OS', desc: 'Operating Systems' },
  { id: 'CN', name: 'CN', desc: 'Computer Networks' },
  { id: 'Java', name: 'Java', desc: 'Java Development' },
  { id: 'Python', name: 'Python', desc: 'Python Development' },
  { id: 'HR', name: 'HR', desc: 'Behavioral & HR' },
  { id: 'System Design', name: 'System Design', desc: 'System Architecture' },
  { id: 'Web Development', name: 'Web Dev', desc: 'Frontend & Backend' }
];

export default function MockInterviewSetup({ onStart }) {
  const [durationLimit, setDurationLimit] = useState(600); // 10 minutes default
  const [selectedTopics, setSelectedTopics] = useState(['DSA', 'OOP']);
  const [questionCount, setQuestionCount] = useState(5); // 5 questions default

  const handleToggleTopic = (topicId) => {
    if (selectedTopics.includes(topicId)) {
      if (selectedTopics.length === 1) {
        alert("Please select at least one topic.");
        return;
      }
      setSelectedTopics(selectedTopics.filter(t => t !== topicId));
    } else {
      setSelectedTopics([...selectedTopics, topicId]);
    }
  };

  const handleSelectAll = () => {
    setSelectedTopics(TOPICS.map(t => t.id));
  };

  const handleSelectNone = () => {
    setSelectedTopics([]);
  };

  const handleStartSubmit = (e) => {
    e.preventDefault();

    if (selectedTopics.length === 0) {
      alert("Please select at least one topic.");
      return;
    }

    onStart({
      durationLimit,
      topics: selectedTopics,
      questionCount
    });
  };

  return (
    <div className="glass-panel mock-setup-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <Settings size={24} className="text-secondary" />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>AI Mock Interview Setup</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
        Configure your AI mock interview. The AI interviewer will dynamically generate highly relevant questions from your selected topics, adjusting difficulty based on your performance, and evaluate your responses in real time.
      </p>

      <form onSubmit={handleStartSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Topics Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Topics to Assess</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={handleSelectAll} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>Select All</button>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>|</span>
              <button type="button" onClick={handleSelectNone} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear All</button>
            </div>
          </div>
          
          <div className="mock-categories-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {TOPICS.map(topic => {
              const isSelected = selectedTopics.includes(topic.id);
              return (
                <div
                  key={topic.id}
                  onClick={() => handleToggleTopic(topic.id)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    padding: '0.6rem 0.8rem', 
                    background: isSelected ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255,255,255,0.01)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--secondary)' : 'var(--border-light)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 10px rgba(6, 182, 212, 0.1)' : 'none'
                  }}
                >
                  {isSelected ? <CheckSquare size={16} className="text-secondary" /> : <Square size={16} style={{ color: 'var(--text-dim)' }} />}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topic.name}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topic.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Question Count Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Number of Questions</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[3, 5, 7, 10].map(count => (
              <button
                key={count}
                type="button"
                className={`btn ${questionCount === count ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQuestionCount(count)}
                style={{ padding: '0.6rem 0', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {count} Qs
              </button>
            ))}
          </div>
        </div>

        {/* Interview Duration Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Interview Time Limit</label>
          <div className="mock-duration-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              { label: '5 Mins', value: 300 },
              { label: '10 Mins', value: 600 },
              { label: '15 Mins', value: 900 },
              { label: '30 Mins', value: 1800 }
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${durationLimit === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDurationLimit(opt.value)}
                style={{ padding: '0.6rem 0', fontSize: '0.85rem' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Info Card */}
        <div className="glass-card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.15)', fontSize: '0.8rem' }}>
          <HelpCircle size={16} className="text-primary" />
          <span style={{ color: 'var(--text-muted)' }}>
            The AI interviewer dynamically updates difficulty based on performance. High scores lead to harder questions; poor scores lead to simpler ones. Evaluations run fully in the background.
          </span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn btn-primary pulse-button"
          disabled={selectedTopics.length === 0}
          style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <Play size={18} fill="white" /> Start AI Mock Interview
        </button>
      </form>
    </div>
  );
}
