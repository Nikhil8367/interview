import React from 'react';
import { Award, Clock, Activity, MessageSquare, ShieldAlert, Sparkles, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function AssessmentReport({ report, question, onReset, backLabel }) {
  if (!report) return null;

  const {
    score,
    wordCount,
    wpm,
    fillerCount,
    fillerBreakdown,
    grammarMistakes = [],
    theoryMistakes = [],
    feedback,
    paceRating,
    paceFeedback,
    totalDuration = 0,
    breaksCount = 0
  } = report;

  // Resolve the active question object
  const activeQuestionObj = question || report.question;

  // Determine status color based on score
  const getScoreColor = (val) => {
    if (val >= 80) return 'var(--success)';
    if (val >= 55) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getPaceStatus = (val) => {
    if (val === 'Good' || val === 'Normal') return 'status-good';
    if (val === 'Too Slow' || val === 'Too Fast') return 'status-danger';
    return 'status-warning';
  };

  const scoreColor = getScoreColor(score);
  const scoreDeg = (score / 100) * 360;

  return (
    <div className="assessment-dashboard">
      <div className="report-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={24} style={{ color: scoreColor }} />
          <h2 style={{ fontSize: '1.5rem' }}>AI Performance Review</h2>
        </div>
        <button className="btn btn-secondary" onClick={onReset}>
          <ArrowLeft size={16} /> {backLabel || 'Practice Again'}
        </button>
      </div>

      {/* Main Stats Panel */}
      <div className="report-main-grid">
        {/* Overall Score Radial */}
        <div className="overall-score-card">
          <div className="score-radial" style={{ '--score-deg': scoreDeg, background: `conic-gradient(${scoreColor} ${scoreDeg}deg, rgba(255,255,255,0.05) 0deg)` }}>
            <span className="score-number">{score}</span>
          </div>
          <div className="score-meta">
            <span className="score-title">Overall Score</span>
            <span className="score-desc" style={{ color: scoreColor, fontWeight: 700 }}>
              {score >= 80 ? 'Excellent Interviewer' : score >= 60 ? 'Competent - Room to Improve' : 'Needs Structured Practice'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Weigthed: 40% Technical, 30% Delivery, 30% Grammar
            </span>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="metrics-grid">
          {/* Duration */}
          <div className="metric-card">
            <div className="metric-header">
              <span>Duration</span>
              <Clock size={14} />
            </div>
            <span className="metric-value">{Math.floor(totalDuration / 60)}m {totalDuration % 60}s</span>
            <span className="metric-label">Total elapsed time</span>
          </div>

          {/* Pace */}
          <div className="metric-card">
            <div className="metric-header">
              <span>Pace</span>
              <Activity size={14} />
            </div>
            <span className="metric-value">{wpm} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>WPM</span></span>
            <span className={`metric-status ${getPaceStatus(paceRating)}`}>
              {paceRating}
            </span>
          </div>

          {/* Pauses / Breaks */}
          <div className="metric-card">
            <div className="metric-header">
              <span>Speech Breaks</span>
              <ShieldAlert size={14} />
            </div>
            <span className="metric-value">{breaksCount}</span>
            <span className={`metric-status ${breaksCount > 4 ? 'status-danger' : breaksCount > 2 ? 'status-warning' : 'status-good'}`}>
              {breaksCount > 4 ? 'Heavy Hesitation' : breaksCount > 2 ? 'Moderate Gaps' : 'Fluent Flow'}
            </span>
          </div>

          {/* Filler Words */}
          <div className="metric-card">
            <div className="metric-header">
              <span>Filler Words</span>
              <MessageSquare size={14} />
            </div>
            <span className="metric-value">{fillerCount}</span>
            <span className={`metric-status ${fillerCount > 5 ? 'status-danger' : fillerCount > 2 ? 'status-warning' : 'status-good'}`}>
              {fillerCount > 5 ? 'High Usage' : fillerCount > 0 ? 'Acceptable' : 'Perfect Delivery'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Recommendation panel */}
      <div className="glass-card" style={{ borderLeft: '4px solid var(--primary)', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Sparkles size={16} className="text-secondary" />
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>AI Communication Coach Notes</h4>
        </div>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>{feedback}</p>
        {paceFeedback && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
            <strong>Pace Assessment:</strong> {paceFeedback}
          </p>
        )}
        {fillerCount > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Filler Words Used:</span>
            <div className="question-keywords" style={{ marginTop: '0.25rem' }}>
              {Object.entries(fillerBreakdown).map(([word, count]) => (
                <span key={word} className="keyword-tag" style={{ borderColor: 'var(--warning-glow)', color: 'var(--warning)' }}>
                  "{word}": {count}x
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeQuestionObj?.suggestedAnswer && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--secondary)', padding: '1.25rem', marginTop: '1rem', background: 'rgba(6, 182, 212, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={16} className="text-secondary" />
            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>Suggested / Reference Answer</h4>
          </div>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
            {activeQuestionObj.suggestedAnswer}
          </p>
        </div>
      )}

      {/* Audits: Grammar vs Theory */}
      <div className="audits-container">
        {/* Grammar Audits */}
        <div className="audit-section">
          <div className="audit-title-bar">
            <CheckCircle2 size={16} className="text-success" />
            <span>Grammar & Clarity Audit</span>
            <span className="category-tag" style={{ marginLeft: 'auto', background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
              {grammarMistakes.length} issues
            </span>
          </div>
          
          <div className="audit-list">
            {grammarMistakes.length > 0 ? (
              grammarMistakes.map((item, idx) => (
                <div key={idx} className="audit-item error">
                  <div className="audit-item-header">
                    <span style={{ color: 'var(--danger)' }}>Grammar Slip</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block' }}>You said:</span>
                    <span className="audit-original">"{item.original}"</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block' }}>Better phrasing:</span>
                    <span className="audit-correction">"{item.correction}"</span>
                  </div>
                  <p className="audit-explanation">{item.explanation}</p>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: '2rem', background: 'rgba(255,255,255,0.01)' }}>
                <CheckCircle2 size={32} className="text-success" />
                <p style={{ fontSize: '0.85rem' }}>No grammatical errors detected. Speech was clear and well-structured.</p>
              </div>
            )}
          </div>
        </div>

        {/* Theory Audits */}
        <div className="audit-section">
          <div className="audit-title-bar">
            <AlertTriangle size={16} className="text-secondary" />
            <span>Technical & Theory Audit</span>
            <span className="category-tag" style={{ marginLeft: 'auto', background: 'rgba(6,182,212,0.1)', color: 'var(--secondary)' }}>
              {theoryMistakes.length} gaps
            </span>
          </div>

          <div className="audit-list">
            {theoryMistakes.length > 0 ? (
              theoryMistakes.map((item, idx) => (
                <div key={idx} className="audit-item warning">
                  <div className="audit-item-header">
                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{item.concept}</span>
                  </div>
                  <p className="audit-explanation" style={{ margin: '0.2rem 0', color: 'var(--text-main)' }}>
                    <strong>Problem:</strong> {item.explanation}
                  </p>
                  <p className="audit-explanation" style={{ color: 'var(--text-muted)' }}>
                    <strong>Recommendation:</strong> {item.correction}
                  </p>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: '2rem', background: 'rgba(255,255,255,0.01)' }}>
                <CheckCircle2 size={32} className="text-secondary" />
                <p style={{ fontSize: '0.85rem' }}>Splendid! You successfully hit all core technical theory concepts for this question.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', paddingBottom: '2rem' }}>
        <button className="btn btn-primary pulse-button" style={{ padding: '0.85rem 3rem' }} onClick={onReset}>
          {backLabel || 'Practice Another Question'}
        </button>
      </div>
    </div>
  );
}
