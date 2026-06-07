import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Clock, 
  MessageSquare, 
  Activity, 
  Search, 
  Calendar, 
  TrendingUp, 
  ArrowLeft,
  SlidersHorizontal,
  BookOpen,
  Trash2,
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import AssessmentReport from './AssessmentReport';
import MockInterviewReport from './MockInterviewReport';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';

export default function HistoryView({ user }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filtering & Sorting State
  const [filterType, setFilterType] = useState('all'); // 'all' | 'practice' | 'mock'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'highest' | 'lowest'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected detailed report
  const [selectedReport, setSelectedReport] = useState(null);
  
  // Chart Hover State
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Fetch reports on mount/user change
  useEffect(() => {
    if (!user) return;
    const fetchReports = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'reports'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReports(data);
      } catch (err) {
        console.error('Error fetching reports:', err);
        setError('Network error: Could not retrieve history.');
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [user]);

  // Handle report deletion
  const handleDeleteReport = async (reportId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this session report? This action cannot be undone.")) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      console.error("Error deleting report:", err);
      alert("Network error: Unable to complete delete operation.");
    }
  };

  if (selectedReport) {
    if (selectedReport.type === 'mock' || selectedReport.type === 'realtime') {
      return (
        <MockInterviewReport 
          report={selectedReport} 
          onReset={() => setSelectedReport(null)} 
          backLabel="Back to History" 
        />
      );
    } else {
      return (
        <AssessmentReport 
          report={selectedReport} 
          onReset={() => setSelectedReport(null)} 
          backLabel="Back to History" 
        />
      );
    }
  }

  // Format Helper for Date
  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Helper for Session Duration
  const formatDuration = (secs) => {
    if (!secs) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Filter & Search Reports
  const filteredReports = reports.filter(item => {
    // Type Filter
    if (filterType !== 'all' && item.type !== filterType) return false;
    
    // Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const questionText = item.question?.text || '';
      const mockQuestionsText = item.questions ? item.questions.map(q => q.question?.text || '').join(' ') : '';
      const feedbackText = item.feedback || '';
      const categoryText = item.question?.category || '';
      
      return (
        questionText.toLowerCase().includes(query) ||
        mockQuestionsText.toLowerCase().includes(query) ||
        feedbackText.toLowerCase().includes(query) ||
        categoryText.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Calculate Aggregated Metrics dynamically based on filtered reports
  const totalSessions = filteredReports.length;
  const averageScore = totalSessions > 0 
    ? Math.round(filteredReports.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalSessions) 
    : 0;
  
  const averageWpm = totalSessions > 0
    ? Math.round(filteredReports.reduce((acc, curr) => acc + (curr.wpm || 0), 0) / totalSessions)
    : 0;

  const totalFillerWords = filteredReports.reduce((acc, curr) => acc + (curr.fillerCount || 0), 0);

  // Sort Reports
  const sortedReports = [...filteredReports].sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    
    if (sortBy === 'newest') return timeB - timeA;
    if (sortBy === 'oldest') return timeA - timeB;
    if (sortBy === 'highest') return (b.score || 0) - (a.score || 0);
    if (sortBy === 'lowest') return (a.score || 0) - (b.score || 0);
    return 0;
  });

  // Score Color Helper
  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'; // emerald
    if (score >= 60) return '#f59e0b'; // amber
    return '#ef4444'; // rose
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'rgba(16, 185, 129, 0.1)';
    if (score >= 60) return 'rgba(245, 158, 11, 0.1)';
    return 'rgba(239, 68, 68, 0.1)';
  };

  // Chronological Data for Line Chart (Oldest to Newest) based on filtered reports
  const chartData = [...filteredReports]
    .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime())
    .slice(-10); // Show last 10 sessions for readable trend

  // SVG Chart Dimensions & Coordinates
  const chartWidth = 750;
  const chartHeight = 220;
  const paddingX = 50;
  const paddingY = 40;

  const points = chartData.map((d, index) => {
    const x = chartData.length > 1 
      ? paddingX + (index / (chartData.length - 1)) * (chartWidth - 2 * paddingX)
      : chartWidth / 2;
    const y = chartHeight - paddingY - ((d.score || 0) / 100) * (chartHeight - 2 * paddingY);
    return { x, y, data: d };
  });

  // Generate SVG Path
  const linePath = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : '';

  // Generate Area Path (for gradient under-fill)
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', animation: 'fadeIn 0.4s ease-out' }}>
      
      {/* Page Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid var(--border-light)', 
        paddingBottom: '1.25rem',
        marginTop: '0.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
              padding: '0.5rem',
              borderRadius: '8px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)'
            }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
                Performance History
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                Review speech metrics, track progression charts, and manage your interactive assessment records.
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '1rem' }}>
          <div className="pulse-loader" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid rgba(139, 92, 246, 0.1)', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>Retrieving assessment telemetry...</span>
        </div>
      ) : error ? (
        <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.02)' }}>
          <TrendingDown size={36} style={{ color: 'var(--danger)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'white', fontSize: '0.95rem', fontWeight: 600 }}>{error}</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Try reloading the dashboard or check server logs.</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            padding: '1.25rem',
            borderRadius: '50%',
            color: 'var(--text-dim)',
            border: '1px solid var(--border-light)'
          }}>
            <Award size={48} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>No Practice History Yet</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '440px', lineHeight: 1.6 }}>
            Complete your first interactive practice session or try out a full mock interview to generate instant reports, speech pace evaluations, and performance analytics.
          </p>
        </div>
      ) : (
        <>
          {/* Analytics Overview Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-card metric-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <TrendingUp size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Sessions</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.15rem', color: 'white' }}>{totalSessions}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Completed runs</div>
                </div>
              </div>
            </div>

            <div className="glass-card metric-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: `radial-gradient(circle, ${getScoreColor(averageScore)}08 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: getScoreBg(averageScore), color: getScoreColor(averageScore), padding: '0.75rem', borderRadius: '12px', border: `1px solid ${getScoreColor(averageScore)}20` }}>
                  <Award size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Average Score</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: getScoreColor(averageScore), marginTop: '0.15rem' }}>
                    {averageScore}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                    {averageScore >= 80 ? '👑 EXCELLENT' : averageScore >= 60 ? '👍 COMPETENT' : '⚠️ NEEDS WORK'}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card metric-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                  <Activity size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Avg Speech Pace</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.15rem', color: 'white' }}>
                    {averageWpm} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-dim)' }}>WPM</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Ideal range: 120-160</div>
                </div>
              </div>
            </div>

            <div className="glass-card metric-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <MessageSquare size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Fillers</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.15rem', color: 'white' }}>{totalFillerWords}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Um, ah, like, you know</div>
                </div>
              </div>
            </div>
          </div>

          {/* SVG Trend Line Chart */}
          <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 Analytics Timeline & Score Trends
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                  Visualizing evaluation metrics for the last 10 practice runs
                </p>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontWeight: 600 }}>
                Chronological
              </span>
            </div>
            
            <div style={{ position: 'relative', width: '100%', overflowX: 'auto', padding: '0.5rem 0' }}>
               {chartData.length === 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-light)' }}>
                   <TrendingUp size={24} style={{ color: 'var(--text-dim)' }} />
                   <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 500 }}>No trend data for selected filters.</span>
                 </div>
               ) : (
                 <svg 
                   viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                   style={{ width: '100%', minWidth: '650px', height: 'auto', display: 'block' }}
                 >
                   <defs>
                     {/* Grid / Line Gradients */}
                     <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
                       <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                     </linearGradient>
                     <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                       <stop offset="0%" stopColor="var(--primary)" />
                       <stop offset="100%" stopColor="var(--secondary)" />
                     </linearGradient>
                   </defs>

                   {/* Y-Axis Grid Lines & Labels */}
                   {[0, 25, 50, 75, 100].map((level) => {
                     const y = chartHeight - paddingY - (level / 100) * (chartHeight - 2 * paddingY);
                     return (
                       <g key={level}>
                         <line 
                           x1={paddingX} 
                           y1={y} 
                           x2={chartWidth - paddingX} 
                           y2={y} 
                           stroke="rgba(255, 255, 255, 0.03)" 
                           strokeWidth="1" 
                         />
                         <text 
                           x={paddingX - 12} 
                           y={y + 3.5} 
                           fill="var(--text-dim)" 
                           fontSize="9.5" 
                           textAnchor="end"
                           fontFamily="var(--font-display)"
                           fontWeight="500"
                         >
                           {level}%
                         </text>
                       </g>
                     );
                   })}

                   {/* Area under the line */}
                   {areaPath && (
                     <path d={areaPath} fill="url(#chartGrad)" />
                   )}

                   {/* Main Trend Line */}
                   {linePath && (
                     <path 
                       d={linePath} 
                       fill="none" 
                       stroke="url(#lineGrad)" 
                       strokeWidth="3.5" 
                       strokeLinecap="round"
                       strokeLinejoin="round" 
                     />
                   )}

                   {/* Interaction Dots */}
                   {points.map((p, i) => (
                     <g key={i}>
                       {/* Vertical date indicator column */}
                       {hoveredPoint === i && (
                         <line 
                           x1={p.x} 
                           y1={paddingY} 
                           x2={p.x} 
                           y2={chartHeight - paddingY} 
                           stroke="rgba(139, 92, 246, 0.15)" 
                           strokeDasharray="3 3" 
                           strokeWidth="1.5"
                         />
                       )}
                       
                       {/* Outer Glow on hover */}
                       {hoveredPoint === i && (
                         <circle 
                           cx={p.x} 
                           cy={p.y} 
                           r="11" 
                           fill={getScoreColor(p.data.score)} 
                           opacity="0.25" 
                         />
                       )}

                       <circle 
                         cx={p.x} 
                         cy={p.y} 
                         r="5.5" 
                         fill={getScoreColor(p.data.score)} 
                         stroke="#0b0f19" 
                         strokeWidth="2.5" 
                         style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                         onMouseEnter={() => setHoveredPoint(i)}
                         onMouseLeave={() => setHoveredPoint(null)}
                         onClick={() => setSelectedReport(p.data)}
                       />

                       {/* X-Axis labels (Dates) */}
                       <text 
                         x={p.x} 
                         y={chartHeight - 12} 
                         fill="var(--text-dim)" 
                         fontSize="9" 
                         textAnchor="middle"
                         fontFamily="var(--font-body)"
                         fontWeight="500"
                       >
                         {formatShortDate(p.data.timestamp)}
                       </text>

                       {/* Scores displayed directly above nodes */}
                       <text 
                         x={p.x} 
                         y={p.y - 12} 
                         fill="white" 
                         fontSize="10" 
                         fontWeight="700"
                         textAnchor="middle"
                         fontFamily="var(--font-display)"
                       >
                         {p.data.score}
                       </text>
                     </g>
                   ))}
                 </svg>
               )}

              {/* Hover Tooltip Card */}
              {hoveredPoint !== null && points[hoveredPoint] && (
                <div style={{
                  position: 'absolute',
                  top: `${points[hoveredPoint].y - 58}px`,
                  left: `${points[hoveredPoint].x + 16}px`,
                  background: 'rgba(11, 15, 25, 0.96)',
                  border: `1px solid ${getScoreColor(points[hoveredPoint].data.score)}`,
                  padding: '0.6rem 0.8rem',
                  borderRadius: '8px',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.6), inset 0 0 10px rgba(255,255,255,0.01)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  minWidth: '160px',
                  backdropFilter: 'blur(8px)',
                  animation: 'fadeIn 0.15s ease-out'
                }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
                    {points[hoveredPoint].data.type === 'realtime' ? 'REALTIME SPEAK' : points[hoveredPoint].data.type === 'mock' ? 'MOCK INTERVIEW' : 'SINGLE PRACTICE'}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 800 }}>
                    Score: {points[hoveredPoint].data.score}/100
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                    {formatDate(points[hoveredPoint].data.timestamp)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div className="glass-card" style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '1.25rem', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '1.25rem' 
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '280px' }}>
              <Search 
                size={16} 
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} 
              />
              <input 
                type="text" 
                className="input-field" 
                placeholder="Filter history by question, category, or feedback tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '2.4rem', paddingRight: '1rem', height: '42px', fontSize: '0.88rem' }}
              />
            </div>

            {/* Filter and Sort Selectors */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                background: 'rgba(255,255,255,0.02)', 
                padding: '0.5rem 0.85rem', 
                borderRadius: '10px', 
                border: '1px solid var(--border-light)' 
              }}>
                <SlidersHorizontal size={14} className="text-secondary" />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Type:</span>
                <select 
                  value={filterType} 
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.78rem', outline: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  <option value="all" style={{ background: '#0b0f19' }}>All Sessions</option>
                  <option value="practice" style={{ background: '#0b0f19' }}>Practice Mode</option>
                  <option value="mock" style={{ background: '#0b0f19' }}>Mock Arena</option>
                  <option value="realtime" style={{ background: '#0b0f19' }}>Realtime Speak</option>
                </select>
              </div>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                background: 'rgba(255,255,255,0.02)', 
                padding: '0.5rem 0.85rem', 
                borderRadius: '10px', 
                border: '1px solid var(--border-light)' 
              }}>
                <Calendar size={14} className="text-primary" />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Sort:</span>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.78rem', outline: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  <option value="newest" style={{ background: '#0b0f19' }}>Newest Run</option>
                  <option value="oldest" style={{ background: '#0b0f19' }}>Oldest Run</option>
                  <option value="highest" style={{ background: '#0b0f19' }}>Top Score</option>
                  <option value="lowest" style={{ background: '#0b0f19' }}>Lowest Score</option>
                </select>
              </div>
            </div>
          </div>

          {/* Session Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                Matched {sortedReports.length} {sortedReports.length === 1 ? 'assessment' : 'assessments'}
              </span>
            </div>

            {sortedReports.map((item) => {
              const isMock = item.type === 'mock';
              const isRealtime = item.type === 'realtime';
              const title = isRealtime 
                ? `Realtime Speak Session (${item.questions?.length || 0} Questions)`
                : isMock 
                  ? `Mock Interview Session (${item.questions?.length || 0} Questions)`
                  : (item.question?.text || 'Practice Question');
              const category = isRealtime
                ? 'Realtime Arena'
                : isMock 
                  ? 'Mock Assessment'
                  : (item.question?.category || 'General Practice');

              return (
                <div 
                  key={item.id} 
                  className="glass-card history-session-card" 
                  style={{ 
                    padding: '1.5rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem', 
                    borderLeft: `4px solid ${isRealtime ? '#8b5cf6' : isMock ? 'var(--secondary)' : 'var(--primary)'}`,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    position: 'relative'
                  }}
                >
                  {/* Top Line: Session Type badge, Date, Title, Score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ 
                          fontSize: '0.62rem', 
                          fontWeight: 800, 
                          padding: '3px 9px', 
                          borderRadius: '6px',
                          letterSpacing: '0.06em',
                          color: isRealtime ? '#a78bfa' : isMock ? 'var(--secondary)' : 'var(--primary)',
                          background: isRealtime ? 'rgba(139, 92, 246, 0.08)' : isMock ? 'rgba(6, 182, 212, 0.08)' : 'rgba(139, 92, 246, 0.08)',
                          border: `1px solid ${isRealtime ? 'rgba(139, 92, 246, 0.15)' : isMock ? 'rgba(6, 182, 212, 0.15)' : 'rgba(139, 92, 246, 0.15)'}`
                        }}>
                          {isRealtime ? 'REALTIME SPEAK' : isMock ? 'MOCK INTERVIEW' : 'SINGLE QUESTION'}
                        </span>
                        
                        <span className="category-tag" style={{ fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                          {category}
                        </span>
                        
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.25rem' }}>
                          <Calendar size={12} /> {formatDate(item.timestamp)}
                        </span>
                      </div>
                      
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', marginTop: '0.35rem', lineHeight: '1.4', letterSpacing: '-0.01em' }}>
                        {title}
                      </h3>
                    </div>

                    {/* Circular Score Badge */}
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '50%', 
                      border: `2px solid ${getScoreColor(item.score)}`,
                      background: getScoreBg(item.score),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: `0 0 10px ${getScoreColor(item.score)}15`
                    }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>
                        {item.score}
                      </span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ height: '1px', background: 'var(--border-light)', margin: '0.25rem 0' }} />

                  {/* Body Content: Feedback Note + Metas */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    gap: '2rem',
                    flexWrap: 'wrap'
                  }}>
                    {/* Short Feedback Preview */}
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <p style={{ 
                        fontSize: '0.82rem', 
                        color: 'var(--text-muted)', 
                        lineHeight: '1.6',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        margin: 0
                      }}>
                        {item.feedback || 'No summary comments recorded for this evaluation run.'}
                      </p>
                    </div>

                    {/* Telemetry Metrics & Buttons Row */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1.5rem', 
                      flexWrap: 'wrap', 
                      justifyContent: 'space-between',
                      width: 'auto'
                    }}>
                      {/* Sub-telemetries */}
                      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', color: 'var(--text-dim)', borderRight: '1px solid var(--border-light)', paddingRight: '1.25rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '0.85rem' }}>{item.wpm}</span>
                          <span style={{ fontSize: '0.62rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>WPM</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '0.85rem' }}>{item.fillerCount}</span>
                          <span style={{ fontSize: '0.62rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Fillers</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '0.85rem' }}>{formatDuration(item.totalDuration)}</span>
                          <span style={{ fontSize: '0.62rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Duration</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setSelectedReport(item)}
                          style={{ 
                            padding: '0.5rem 1rem', 
                            fontSize: '0.8rem', 
                            borderRadius: '8px', 
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          View Report <ChevronRight size={14} />
                        </button>

                        <button 
                          onClick={(e) => handleDeleteReport(item.id, e)}
                          style={{ 
                            padding: '0.5rem', 
                            borderRadius: '8px', 
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            color: '#f87171', // light rose
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            height: '34px',
                            width: '34px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                          }}
                          title="Delete report"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
