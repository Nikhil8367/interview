import React, { useState } from 'react';
import { Award, Clock, AlertTriangle, MessageSquare, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, XCircle, Copy, Check, ArrowLeft } from 'lucide-react';

export default function MockInterviewReport({ report, onReset, backLabel }) {
  const [expandedQuestion, setExpandedQuestion] = useState(0); // expand first question by default
  const [copied, setCopied] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState({});
  const [revealOverallScore, setRevealOverallScore] = useState(true);
  const [revealTopicScores, setRevealTopicScores] = useState(true);
  const [revealReviews, setRevealReviews] = useState(true);
  const [revealQuestionScores, setRevealQuestionScores] = useState({});

  const toggleTask = (idx) => {
    setCheckedTasks(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleExpand = (index) => {
    setExpandedQuestion(expandedQuestion === index ? null : index);
  };

  const toggleRevealQuestionScore = (idx) => {
    setRevealQuestionScores(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopySummary = () => {
    const text = `
# Mock Interview Report Summary
**Overall Score:** ${report.score}/100
**Duration:** ${formatTime(report.totalDuration)}
**Pacing:** ${report.wpm} WPM (${report.paceRating})
**Filler Words:** ${report.fillerCount}
**Speech Breaks:** ${report.breaksCount}

## AI Overall Feedback
${report.feedback}

## Key Strengths
${(report.strengths || []).map(s => `- ${s}`).join('\n')}

## Areas to Improve
${(report.weaknesses || []).map(w => `- ${w}`).join('\n')}

## Actionable Next Steps
${(report.actionableSteps || []).map(t => `- [ ] ${t}`).join('\n')}
`;
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className="glass-panel mock-report-container">
      {/* Header */}
      <div className="mock-report-header">
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>Mock Interview Report</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Comprehensive performance review and AI speech audit</p>
        </div>
        <div className="mock-report-header-buttons">
          <button 
            className="btn btn-secondary" 
            onClick={handleCopySummary} 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border-light)' }}
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
          <button 
            className={backLabel ? "btn btn-secondary" : "btn btn-primary"} 
            onClick={onReset} 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {backLabel ? <ArrowLeft size={16} /> : <RefreshCw size={16} />}
            {backLabel || 'Practice Again'}
          </button>
        </div>
      </div>

      <div className="mock-report-scroll-container">
        {/* Overview Cards Container */}
        <div className="mock-report-main-grid">
          {/* Left: Overall score circle */}
          <div className="glass-card mock-score-circle-card">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Rating</span>
            
            <div style={{ position: 'relative', width: '120px', height: '120px', margin: '1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                <circle cx="60" cy="60" r="50" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
                <circle 
                  cx="60" 
                  cy="60" 
                  r="50" 
                  fill="transparent" 
                  stroke={revealOverallScore ? getScoreColor(report.score ?? 0) : 'var(--text-dim)'} 
                  strokeWidth="8" 
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={revealOverallScore ? `${2 * Math.PI * 50 * (1 - (report.score ?? 0) / 100)}` : `${2 * Math.PI * 50 * 0.9}`}
                  strokeLinecap="round"
                  style={{ filter: revealOverallScore ? `drop-shadow(0 0 6px ${getScoreColor(report.score ?? 0)}80)` : 'none' }}
                />
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: revealOverallScore ? '2.25rem' : '1.5rem', fontWeight: 800, color: 'white' }}>
                  {revealOverallScore ? (report.score ?? 0) : '??'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>/ 100</span>
              </div>
            </div>

            {revealOverallScore ? (
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                background: `${getScoreColor(report.score ?? 0)}15`,
                color: getScoreColor(report.score ?? 0),
                border: `1px solid ${getScoreColor(report.score ?? 0)}30`,
                padding: '2px 8px', 
                borderRadius: '12px',
                marginBottom: '0.5rem'
              }}>
                {(report.score ?? 0) >= 80 ? 'EXCELLENT' : (report.score ?? 0) >= 60 ? 'COMPETENT' : 'NEEDS PRACTICE'}
              </span>
            ) : (
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-dim)',
                border: '1px solid var(--border-light)',
                padding: '2px 8px', 
                borderRadius: '12px',
                marginBottom: '0.5rem'
              }}>
                RATING HIDDEN
              </span>
            )}

            <button
              className="btn btn-secondary"
              onClick={() => setRevealOverallScore(!revealOverallScore)}
              style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', height: 'auto', borderRadius: '4px' }}
            >
              {revealOverallScore ? 'Hide Rating' : 'Reveal Rating'}
            </button>
          </div>

          {/* Right: Key Telemetry Metrics */}
          <div className="grid-2col" style={{ gap: '1rem' }}>
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)', padding: '0.75rem', borderRadius: '10px' }}>
                <Clock size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Duration</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatTime(report.totalDuration)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>active mock timing</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '10px' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Speech Breaks / Pauses</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: report.breaksCount > 6 ? 'var(--danger)' : 'white' }}>{report.breaksCount}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>pauses longer than 1.5s</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.75rem', borderRadius: '10px' }}>
                <Award size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Average Pacing</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{report.wpm} WPM</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Rating: {report.paceRating}</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '0.75rem', borderRadius: '10px' }}>
                <MessageSquare size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Filler Words Used</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{report.fillerCount}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  {report.fillerCount > 0 ? Object.keys(report.fillerBreakdown).slice(0, 2).join(', ') : 'no fillers'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Consolidated Critique */}
        <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(139, 92, 246, 0.03)', borderColor: 'rgba(139, 92, 246, 0.15)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)' }}>Overall Performance Audit</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>{report.feedback}</p>
          
          {report.paceFeedback && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-dim)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
              <strong>Coach Pacing Tip:</strong> {report.paceFeedback}
            </div>
          )}
        </div>

        {/* Topic-wise Scores */}
        {report.topicScores && report.topicScores.length > 0 && (
          <div className="glass-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'white' }}>Topic-wise Performance Scores</h3>
              <button
                className="btn btn-secondary"
                onClick={() => setRevealTopicScores(!revealTopicScores)}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', height: 'auto', borderRadius: '4px' }}
              >
                {revealTopicScores ? 'Hide Topic Scores' : 'Reveal Topic Scores'}
              </button>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
              gap: '1rem',
              filter: revealTopicScores ? 'none' : 'blur(4px)',
              pointerEvents: revealTopicScores ? 'auto' : 'none',
              transition: 'all 0.3s ease'
            }}>
              {report.topicScores.map((ts, idx) => (
                <div key={idx} className="glass-card" style={{ padding: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>{ts.topic}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: getScoreColor(ts.score) }}>{ts.score}%</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{ts.explanation}</span>
                </div>
              ))}
            </div>

            {!revealTopicScores && (
              <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)',
                zIndex: 10
              }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setRevealTopicScores(true)}
                  style={{ padding: '0.6rem 1.2rem', borderRadius: '8px' }}
                >
                  Reveal Topic Scores
                </button>
              </div>
            )}
          </div>
        )}

        {/* Behavior and Bluffing Review */}
        <div className="glass-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'white' }}>Detailed Behavioral & Authenticity Reviews</h3>
            <button
              className="btn btn-secondary"
              onClick={() => setRevealReviews(!revealReviews)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', height: 'auto', borderRadius: '4px' }}
            >
              {revealReviews ? 'Hide Reviews' : 'Reveal Reviews'}
            </button>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '1rem',
            filter: revealReviews ? 'none' : 'blur(4px)',
            pointerEvents: revealReviews ? 'auto' : 'none',
            transition: 'all 0.3s ease'
          }}>
            <div className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--secondary)', background: 'rgba(6, 182, 212, 0.02)', margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Award size={16} className="text-secondary" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>Behavior & Confidence Review</h4>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                {report.behavioralAssessment || 'No feedback logged.'}
              </p>
            </div>

            <div className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--danger)', background: 'rgba(239, 68, 68, 0.02)', margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <AlertTriangle size={16} className="text-danger" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>Bluffing & Authenticity Audit</h4>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                {report.bluffingAudit || 'Direct and honest answers.'}
              </p>
            </div>
          </div>

          {!revealReviews && (
            <div style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.4)',
              zIndex: 10
            }}>
              <button
                className="btn btn-primary"
                onClick={() => setRevealReviews(true)}
                style={{ padding: '0.6rem 1.2rem', borderRadius: '8px' }}
              >
                Reveal Performance Reviews
              </button>
            </div>
          )}
        </div>

        {/* Strengths & Weaknesses Card Grid */}
        <div className="grid-2col">
          {/* Strengths */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={16} /> Key Strengths
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(report.strengths || []).map((strength, idx) => (
                <li key={idx} style={{ lineHeight: 1.5 }}>{strength}</li>
              ))}
            </ul>
          </div>

          {/* Weaknesses / Improvements */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--warning)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={16} /> Areas to Focus
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(report.weaknesses || []).map((weakness, idx) => (
                <li key={idx} style={{ lineHeight: 1.5 }}>{weakness}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Homework Tasks / Actionable Next Steps */}
        {report.actionableSteps && report.actionableSteps.length > 0 && (
          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(6, 182, 212, 0.01)', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Actionable Next Steps / Homework
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
              Complete these recommended study tasks to patch technical gaps and refine your delivery pacing:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {report.actionableSteps.map((step, idx) => {
                const isChecked = !!checkedTasks[idx];
                return (
                  <div 
                    key={idx} 
                    onClick={() => toggleTask(idx)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '0.75rem', 
                      padding: '0.75rem 1rem', 
                      background: isChecked ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.01)', 
                      border: isChecked ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-light)', 
                      borderRadius: '8px', 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: isChecked ? 0.7 : 1
                    }}
                  >
                    <div style={{ 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '4px', 
                      border: isChecked ? 'none' : '2px solid var(--text-dim)', 
                      background: isChecked ? 'var(--success)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0
                    }}>
                      {isChecked && <CheckCircle2 size={12} style={{ color: 'white' }} />}
                    </div>
                    <span style={{ 
                      fontSize: '0.85rem', 
                      color: isChecked ? 'var(--text-dim)' : 'white', 
                      lineHeight: 1.4,
                      textDecoration: isChecked ? 'line-through' : 'none'
                    }}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Question Timeline / Breakdown Accordion */}
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'white' }}>Question-by-Question Breakdown</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {report.questions.map((q, idx) => {
              const isExpanded = expandedQuestion === idx;
              const qText = typeof q.question === 'string' ? q.question : q.question?.text || '';
              const qCategory = typeof q.question === 'object' ? q.question?.category || 'General' : 'General';

              return (
                <div key={idx} className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                  {/* Accordion Header */}
                  <div 
                    onClick={() => toggleExpand(idx)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '1.25rem 1.5rem', 
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderBottom: isExpanded ? '1px solid var(--border-light)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '50%', 
                        background: 'rgba(255,255,255,0.05)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>{qCategory}</span>
                        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '2px 0 0 0' }}>{qText}</p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '1rem' }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: getScoreColor(q.score ?? 0) }}>{q.score ?? 0}%</span>
                      <div onClick={() => toggleExpand(idx)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {/* Transcript block */}
                      <div>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Your Answer:</h4>
                        <div className="transcript-panel" style={{ maxHeight: '150px', fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)' }}>
                          "{q.transcript}"
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          <span>Pacing: <strong>{q.wpm} WPM</strong></span>
                          <span>•</span>
                          <span>Duration: <strong>{formatTime(q.duration)}</strong></span>
                          <span>•</span>
                          <span>Breaks: <strong>{q.breaksCount}</strong></span>
                        </div>
                      </div>

                      {/* Suggested Answer Card */}
                      {q.question?.suggestedAnswer && (
                        <div className="glass-card" style={{ padding: '1rem', background: 'rgba(6, 182, 212, 0.02)', borderColor: 'rgba(6, 182, 212, 0.15)', borderLeft: '3px solid var(--secondary)', marginTop: '0.5rem' }}>
                          <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CheckCircle2 size={14} className="text-secondary" /> Suggested Reference Answer:
                          </h4>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-line' }}>
                            {q.question?.suggestedAnswer}
                          </p>
                        </div>
                      )}

                      <div className="grid-2col">
                        {/* Technical Concept Checks */}
                        <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            Theoretical Gap Assessment
                          </h4>
                          {q.theoryMistakes && q.theoryMistakes.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {q.theoryMistakes.map((tm, tIdx) => (
                                <div key={tIdx} style={{ fontSize: '0.8rem', borderBottom: tIdx < q.theoryMistakes.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', paddingBottom: '0.5rem' }}>
                                  <div style={{ fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <XCircle size={12} className="text-danger" /> {tm.concept}
                                  </div>
                                  <p style={{ color: 'var(--text-muted)', margin: '2px 0 4px 0', fontSize: '0.75rem' }}>{tm.explanation}</p>
                                  <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', marginTop: '2px' }}>
                                    <strong>Correction:</strong> {tm.correction}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.8rem' }}>
                              <CheckCircle2 size={16} /> All target technical keywords and concepts were correct!
                            </div>
                          )}
                        </div>

                        {/* Grammar corrections */}
                        <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            Grammar & Delivery Review
                          </h4>
                          {q.grammarMistakes && q.grammarMistakes.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {q.grammarMistakes.map((gm, gIdx) => (
                                <div key={gIdx} style={{ fontSize: '0.8rem', borderBottom: gIdx < q.grammarMistakes.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', paddingBottom: '0.5rem' }}>
                                  <div style={{ textDecoration: 'line-through', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                                    "{gm.original}"
                                  </div>
                                  <div style={{ color: 'var(--secondary)', fontWeight: 600, fontSize: '0.78rem', margin: '2px 0' }}>
                                    → "{gm.correction}"
                                  </div>
                                  <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', margin: 0 }}>{gm.explanation}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.8rem' }}>
                              <CheckCircle2 size={16} /> Standard grammar patterns were correct!
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
