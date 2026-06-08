import React, { useState, useEffect } from 'react';
import { Settings, Play, CheckSquare, Square, HelpCircle } from 'lucide-react';

export default function MockInterviewSetup({ questions, onStart }) {
  const [durationLimit, setDurationLimit] = useState(600); // 10 minutes default
  const [selectedCategories, setSelectedCategories] = useState([]);
  
  // Extract unique categories from questions list
  const categories = Array.from(new Set(questions.map(q => q.category || 'General')));

  // Select all categories by default on mount or questions load
  useEffect(() => {
    if (categories.length > 0 && selectedCategories.length === 0) {
      setSelectedCategories(categories);
    }
  }, [questions]);

  const handleToggleCategory = (cat) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) {
        alert("Please select at least one category.");
        return;
      }
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleSelectAll = () => {
    setSelectedCategories(categories);
  };

  const handleSelectNone = () => {
    setSelectedCategories([]);
  };

  // Filter questions matching selected categories
  const filteredQuestions = questions.filter(q => selectedCategories.includes(q.category || 'General'));

  const handleStartSubmit = (e) => {
    e.preventDefault();

    if (selectedCategories.length === 0) {
      alert("Please select at least one category.");
      return;
    }

    if (filteredQuestions.length === 0) {
      alert("No questions available for the selected categories. Please add some questions or choose different categories.");
      return;
    }

    onStart({
      durationLimit,
      categories: selectedCategories
    });
  };

  return (
    <div className="glass-panel mock-setup-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <Settings size={24} className="text-secondary" />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Mock Interview Settings</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
        Customize your session. We will pick questions randomly from your database matching your preferences. The interview will run continuously under simulated time limits.
      </p>

      <form onSubmit={handleStartSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Interview Duration Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Interview Time Limit</label>
          <div className="mock-duration-grid">
            {[
              { label: '5 Mins', value: 300 },
              { label: '10 Mins', value: 600 },
              { label: '15 Mins', value: 900 },
              { label: '30 Mins', value: 1800 },
              { label: '45 Mins', value: 2700 },
              { label: '60 Mins', value: 3600 }
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${durationLimit === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDurationLimit(opt.value)}
                style={{ padding: '0.75rem 0', fontSize: '0.85rem' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categories Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Categories to Include</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={handleSelectAll} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>All</button>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>|</span>
              <button type="button" onClick={handleSelectNone} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
            </div>
          </div>
          
          <div className="mock-categories-grid">
            {categories.map(cat => {
              const isSelected = selectedCategories.includes(cat);
              const count = questions.filter(q => q.category === cat).length;
              return (
                <div
                  key={cat}
                  onClick={() => handleToggleCategory(cat)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    padding: '0.5rem 0.75rem', 
                    background: isSelected ? 'rgba(6, 182, 212, 0.05)' : 'transparent',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isSelected ? <CheckSquare size={16} className="text-secondary" /> : <Square size={16} style={{ color: 'var(--text-dim)' }} />}
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: '4px' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Validation Summary info */}
        <div className="glass-card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.15)', fontSize: '0.8rem' }}>
          <HelpCircle size={16} className="text-primary" />
          <span style={{ color: 'var(--text-muted)' }}>
            Selected categories contain <strong>{filteredQuestions.length}</strong> available questions. The interview will run continuously selecting random questions from this pool until your selected duration limit is reached.
          </span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn btn-primary pulse-button"
          disabled={filteredQuestions.length === 0}
          style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <Play size={18} fill="white" /> Start Mock Interview
        </button>
      </form>
    </div>
  );
}
