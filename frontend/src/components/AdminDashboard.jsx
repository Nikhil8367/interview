import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, writeBatch, getDocs, where } from 'firebase/firestore';
import { 
  Users, 
  ShieldAlert, 
  Activity, 
  UserMinus, 
  UserCheck, 
  Search, 
  Filter, 
  RefreshCw, 
  Shield, 
  AlertTriangle,
  ArrowRight,
  Clock,
  Terminal,
  Grid,
  LogOut
} from 'lucide-react';
import { logActivity } from '../utils/logger';

export default function AdminDashboard({ user, onLogout }) {
  const [usersList, setUsersList] = useState([]);
  const [logsList, setLogsList] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'users' | 'logs' | 'threats'
  
  // Search & Filter states
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('all');
  const [logSuspiciousOnly, setLogSuspiciousOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Real-time listeners for users and logs
  useEffect(() => {
    setLoading(true);

    // 1. Subscribe to users collection
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(users);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching users for admin:", err);
      setLoading(false);
    });

    // 2. Subscribe to logs collection (limit to last 200 logs to avoid over-fetching)
    const logsQuery = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(200));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogsList(logs);
    }, (err) => {
      console.error("Error fetching activity logs for admin:", err);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
    };
  }, []);

  // Action Handlers
  const handleToggleSuspension = async (targetUser) => {
    const newStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    const actionDesc = newStatus === 'suspended' ? `Suspended user account @${targetUser.username}` : `Activated user account @${targetUser.username}`;
    
    const confirmAction = window.confirm(`Are you sure you want to change @${targetUser.username}'s status to: ${newStatus.toUpperCase()}?`);
    if (!confirmAction) return;

    try {
      // Update in Firestore
      await updateDoc(doc(db, 'users', targetUser.id), { status: newStatus });
      
      // Log admin action
      await logActivity(user, 'admin_action', actionDesc, { targetUserId: targetUser.id, action: 'toggle_suspension', newStatus });
      alert(`User @${targetUser.username} successfully ${newStatus === 'suspended' ? 'suspended' : 'activated'}.`);
    } catch (err) {
      console.error("Failed to update user suspension:", err);
      alert("Error updating account status. Check rules permissions: " + err.message);
    }
  };

  const handleToggleRole = async (targetUser) => {
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    const actionDesc = `Changed @${targetUser.username}'s role to ${newRole.toUpperCase()}`;

    const confirmAction = window.confirm(`Are you sure you want to make @${targetUser.username} a ${newRole.toUpperCase()}?`);
    if (!confirmAction) return;

    try {
      await updateDoc(doc(db, 'users', targetUser.id), { role: newRole });
      await logActivity(user, 'admin_action', actionDesc, { targetUserId: targetUser.id, action: 'toggle_role', newRole });
      alert(`Successfully updated @${targetUser.username}'s role to ${newRole}.`);
    } catch (err) {
      console.error("Failed to update user role:", err);
      alert("Error updating user role: " + err.message);
    }
  };

  // Metrics calculations
  const totalUsersCount = usersList.length;
  const suspendedUsersCount = usersList.filter(u => u.status === 'suspended').length;
  const suspiciousLogsCount = logsList.filter(l => l.isSuspicious).length;
  const adminUsersCount = usersList.filter(u => u.role === 'admin').length;

  // Filtered Users
  const filteredUsers = usersList.filter(u => {
    const search = userSearchTerm.toLowerCase().trim();
    if (!search) return true;
    return (
      (u.username || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.id || '').toLowerCase().includes(search)
    );
  });

  // Filtered Logs
  const filteredLogs = logsList.filter(l => {
    // 1. Search text filter
    const search = logSearchTerm.toLowerCase().trim();
    const matchesSearch = !search || 
      (l.username || '').toLowerCase().includes(search) ||
      (l.description || '').toLowerCase().includes(search) ||
      (l.action || '').toLowerCase().includes(search);

    // 2. Action filter
    const matchesAction = logActionFilter === 'all' || l.action === logActionFilter;

    // 3. Suspicious filter
    const matchesSuspicious = !logSuspiciousOnly || l.isSuspicious === true;

    return matchesSearch && matchesAction && matchesSuspicious;
  });

  // Threat Incidents (Logs that are flagged suspicious)
  const threatLogs = logsList.filter(l => l.isSuspicious);

  // Group threats by user to see who is generating the most risk
  const userThreatScores = {};
  threatLogs.forEach(log => {
    if (!userThreatScores[log.userId]) {
      userThreatScores[log.userId] = {
        userId: log.userId,
        username: log.username,
        count: 0,
        lastSeen: log.timestamp,
        reasons: new Set()
      };
    }
    userThreatScores[log.userId].count += 1;
    if (log.timestamp > userThreatScores[log.userId].lastSeen) {
      userThreatScores[log.userId].lastSeen = log.timestamp;
    }
    if (log.suspiciousReason) {
      userThreatScores[log.userId].reasons.add(log.suspiciousReason);
    }
  });

  const uniqueActions = ['all', ...new Set(logsList.map(l => l.action))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', color: 'white', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Top Threat Level alert banner / Warning Badge */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0.6rem 1.25rem', 
        background: suspiciousLogsCount > 0 ? 'rgba(245, 158, 11, 0.05)' : 'rgba(16, 185, 129, 0.05)', 
        border: suspiciousLogsCount > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)', 
        borderRadius: '10px',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        letterSpacing: '0.05em',
        color: suspiciousLogsCount > 0 ? 'var(--warning)' : '#10b981',
        boxShadow: suspiciousLogsCount > 0 ? '0 0 15px rgba(245, 158, 11, 0.08)' : '0 0 15px rgba(16, 185, 129, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="pulse-dot" style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: suspiciousLogsCount > 0 ? 'var(--warning)' : '#10b981', 
            boxShadow: suspiciousLogsCount > 0 ? '0 0 8px var(--warning)' : '0 0 8px #10b981',
            display: 'inline-block'
          }} />
          <span>STATUS: {suspiciousLogsCount > 0 ? `MITIGATION REQUIRED (${suspiciousLogsCount} THREAT(S) DETECTED)` : 'SYSTEM SECURE // AUDIT CHANNELS ACTIVE'}</span>
        </div>
        <span style={{ opacity: 0.7 }} className="hidden-mobile">SECURE GATEWAY FOR AUTHORIZED PERSONNEL ONLY</span>
      </div>

      {/* Command Center Title & Identity Panel */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1rem',
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            background: 'rgba(139, 92, 246, 0.15)', 
            border: '1px solid rgba(139, 92, 246, 0.3)', 
            padding: '0.75rem', 
            borderRadius: '10px',
            color: 'var(--primary-light)',
            boxShadow: '0 0 15px rgba(139, 92, 246, 0.2)'
          }}>
            <Shield size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'white' }}>
              Verbalyst Command Center
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Active Identity:</span>
              <code style={{ fontSize: '0.75rem', color: 'var(--primary-light)', background: 'rgba(139, 92, 246, 0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
                {user?.email || 'quizdmn@gmail.com'}
              </code>
            </div>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="btn"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            color: '#f87171', 
            padding: '0.55rem 1.1rem', 
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.82rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.05)';
          }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Navigation Subheader */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>MONITORING & MITIGATION CONTROLS</span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setActiveSubTab('overview')} 
            className={`btn ${activeSubTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveSubTab('users')} 
            className={`btn ${activeSubTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            Users ({totalUsersCount})
          </button>
          <button 
            onClick={() => setActiveSubTab('logs')} 
            className={`btn ${activeSubTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            Activity Logs
          </button>
          <button 
            onClick={() => setActiveSubTab('threats')} 
            className={`btn ${activeSubTab === 'threats' ? 'btn-danger' : 'btn-secondary'}`}
            style={{ 
              padding: '0.45rem 1rem', 
              fontSize: '0.8rem', 
              borderRadius: '8px',
              border: activeSubTab === 'threats' ? '1px solid var(--danger)' : '1px solid var(--border-light)'
            }}
          >
            Threat Center {suspiciousLogsCount > 0 && <span style={{ marginLeft: '4px', background: 'var(--danger)', color: 'white', padding: '1px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 800 }}>{suspiciousLogsCount}</span>}
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        
        {/* Total Users */}
        <div className="glass-panel" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05 }}>
            <Users size={80} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Registered Users
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: 'white' }}>
            {loading ? '...' : totalUsersCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Shield size={12} /> {adminUsersCount} Administrators
          </div>
        </div>

        {/* Suspended Accounts */}
        <div className="glass-panel" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', borderLeft: suspendedUsersCount > 0 ? '3px solid var(--danger)' : '1px solid var(--border-light)' }}>
          <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05 }}>
            <UserMinus size={80} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Suspended Accounts
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: suspendedUsersCount > 0 ? 'var(--danger)' : 'white' }}>
            {loading ? '...' : suspendedUsersCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Blocked from logging in & writing to db
          </div>
        </div>

        {/* Total Activity Logs */}
        <div className="glass-panel" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05 }}>
            <Activity size={80} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Audit Log Entries
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: 'white' }}>
            {logsList.length === 200 ? '200+' : logsList.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Clock size={12} /> Live stream active
          </div>
        </div>

        {/* Suspicious Incidents */}
        <div 
          className="glass-panel" 
          style={{ 
            padding: '1.25rem', 
            position: 'relative', 
            overflow: 'hidden', 
            borderLeft: suspiciousLogsCount > 0 ? '3px solid var(--warning)' : '1px solid var(--border-light)',
            background: suspiciousLogsCount > 0 ? 'rgba(245, 158, 11, 0.03)' : 'var(--bg-panel)'
          }}
        >
          <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05 }}>
            <ShieldAlert size={80} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Suspicious Threats
          </span>
          <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: suspiciousLogsCount > 0 ? 'var(--warning)' : 'white' }}>
            {suspiciousLogsCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: suspiciousLogsCount > 0 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: suspiciousLogsCount > 0 ? 600 : 400 }}>
            {suspiciousLogsCount > 0 ? 'Spam or injection patterns flagged' : 'No security threats detected'}
          </div>
        </div>

      </div>

      {/* SUB TAB VIEW: OVERVIEW SUMMARY */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', width: '100%' }}>
          
          {/* Left panel: Top Threat Risks */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <ShieldAlert size={18} className="text-danger" /> Highest Threat Risk Users
              </h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Real-time audit</span>
            </div>

            {Object.keys(userThreatScores).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <UserCheck size={36} style={{ color: 'var(--success)', marginBottom: '0.5rem', opacity: 0.6 }} />
                <p>No high-risk behaviors have been detected recently.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.values(userThreatScores)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((threat) => {
                    const targetUserObj = usersList.find(u => u.id === threat.userId);
                    const isSuspended = targetUserObj?.status === 'suspended';

                    return (
                      <div key={threat.userId} style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isSuspended ? 'var(--text-muted)' : 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            @{threat.username} 
                            {isSuspended && <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' }}>SUSPENDED</span>}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {Array.from(threat.reasons)[0] || 'Flagged activity'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Incidents</span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--warning)' }}>{threat.count}</span>
                          </div>
                          {!isSuspended ? (
                            <button 
                              onClick={() => handleToggleSuspension(targetUserObj)}
                              className="btn btn-danger"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.7rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              <UserMinus size={12} /> Suspend
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleToggleSuspension(targetUserObj)}
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.7rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              <UserCheck size={12} /> Unsuspend
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Right panel: Recent Admin Actions / Activity Summary */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Terminal size={18} className="text-secondary" /> Recent Security Logs
              </h3>
              <button onClick={() => setActiveSubTab('logs')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                View All <ArrowRight size={12} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {logsList.slice(0, 6).map((log) => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.03)' }}>
                  <span style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    background: log.isSuspicious ? 'var(--danger)' : log.action === 'admin_action' ? 'var(--primary)' : 'var(--text-muted)',
                    marginTop: '5px',
                    boxShadow: log.isSuspicious ? '0 0 5px var(--danger)' : 'none'
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: '0.78rem', color: 'white', margin: 0, lineHeight: 1.3 }}>
                      <strong style={{ color: 'var(--secondary)' }}>@{log.username}</strong>: {log.description}
                    </p>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleString()} • <span style={{ textTransform: 'uppercase', fontSize: '0.6rem', color: 'var(--text-dim)' }}>{log.action}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* SUB TAB VIEW: USERS DIRECTORY */}
      {activeSubTab === 'users' && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Search bar */}
          <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search users by username, email, or Firebase ID..."
                className="input-field"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px', margin: 0 }}
              />
            </div>
            {userSearchTerm && (
              <button 
                onClick={() => setUserSearchTerm('')}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem' }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Users Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Loading users database...</div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>No users found matching your search.</div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem', fontWeight: 700 }}>Username</th>
                    <th style={{ padding: '0.75rem', fontWeight: 700 }}>Email Address</th>
                    <th style={{ padding: '0.75rem', fontWeight: 700 }}>Created Date</th>
                    <th style={{ padding: '0.75rem', fontWeight: 700 }}>Access Role</th>
                    <th style={{ padding: '0.75rem', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '0.75rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === user.id;
                    const isSuspended = u.status === 'suspended';
                    const isAdminUser = u.role === 'admin';

                    return (
                      <tr 
                        key={u.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                          background: isSuspended ? 'rgba(239, 68, 68, 0.01)' : isSelf ? 'rgba(139, 92, 246, 0.01)' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Username */}
                        <td style={{ padding: '0.85rem 0.75rem', fontWeight: 600 }}>
                          <span style={{ color: isSuspended ? 'var(--text-muted)' : 'white' }}>
                            @{u.username || 'unknown'}
                          </span>
                          {isSelf && <span style={{ marginLeft: '6px', fontSize: '0.6rem', background: 'var(--primary-glow)', color: 'var(--primary-light)', padding: '2px 5px', borderRadius: '4px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>YOU</span>}
                        </td>
                        
                        {/* Email */}
                        <td style={{ padding: '0.85rem 0.75rem', color: 'var(--text-muted)' }}>
                          {u.email || 'N/A'}
                        </td>
                        
                        {/* Created Date */}
                        <td style={{ padding: '0.85rem 0.75rem', color: 'var(--text-dim)' }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        
                        {/* Role Badge */}
                        <td style={{ padding: '0.85rem 0.75rem' }}>
                          {isAdminUser ? (
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              background: 'rgba(139, 92, 246, 0.12)', 
                              color: 'var(--primary-light)',
                              border: '1px solid rgba(139, 92, 246, 0.3)'
                            }}>
                              ADMINISTRATOR
                            </span>
                          ) : (
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.68rem', 
                              fontWeight: 600, 
                              background: 'rgba(255,255,255,0.03)', 
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-light)'
                            }}>
                              STANDARD USER
                            </span>
                          )}
                        </td>
                        
                        {/* Status Badge */}
                        <td style={{ padding: '0.85rem 0.75rem' }}>
                          {isSuspended ? (
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              background: 'rgba(239, 68, 68, 0.12)', 
                              color: 'var(--danger)',
                              border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}>
                              SUSPENDED
                            </span>
                          ) : (
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              background: 'rgba(16, 185, 129, 0.12)', 
                              color: 'var(--success)',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              ACTIVE
                            </span>
                          )}
                        </td>
                        
                        {/* Action buttons */}
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {/* Toggle Suspension button */}
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleSuspension(u)}
                                className={`btn ${isSuspended ? 'btn-secondary' : 'btn-danger'}`}
                                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                title={isSuspended ? "Activate user account" : "Suspend user account"}
                              >
                                {isSuspended ? (
                                  <>
                                    <UserCheck size={12} /> <span>Activate</span>
                                  </>
                                ) : (
                                  <>
                                    <UserMinus size={12} /> <span>Suspend</span>
                                  </>
                                )}
                              </button>
                            )}

                            {/* Toggle Role Button */}
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleRole(u)}
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                title={isAdminUser ? "Demote to standard user" : "Promote to administrator"}
                              >
                                <Shield size={12} />
                                <span>{isAdminUser ? 'Make User' : 'Make Admin'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB VIEW: ACTIVITY LOGS AUDITOR */}
      {activeSubTab === 'logs' && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Audit Controls & Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search username, action, description..."
                className="input-field"
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px', margin: 0 }}
              />
            </div>

            {/* Action filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={14} className="text-secondary" />
              <select
                className="drawer-select"
                value={logActionFilter}
                onChange={(e) => setLogActionFilter(e.target.value)}
                style={{ margin: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem', background: '#0a0d17', color: 'white', border: '1px solid var(--border-light)', borderRadius: '6px' }}
              >
                {uniqueActions.map(act => (
                  <option key={act} value={act}>
                    {act === 'all' ? 'All Action Types' : act.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Threat checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>
              <input 
                type="checkbox"
                checked={logSuspiciousOnly}
                onChange={(e) => setLogSuspiciousOnly(e.target.checked)}
                style={{ accentColor: 'var(--danger)' }}
              />
              Show Only Suspicious Logs
            </label>
          </div>

          {/* Logs List */}
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>No logs found matching your filters.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredLogs.map((log) => {
                const targetUserObj = usersList.find(u => u.id === log.userId);
                const isSuspended = targetUserObj?.status === 'suspended';

                return (
                  <div 
                    key={log.id} 
                    style={{ 
                      padding: '1rem', 
                      background: log.isSuspicious ? 'rgba(239, 68, 68, 0.03)' : 'rgba(255, 255, 255, 0.01)', 
                      border: '1px solid',
                      borderColor: log.isSuspicious ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-light)',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      position: 'relative'
                    }}
                  >
                    {log.isSuspicious && (
                      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <AlertTriangle size={10} /> SUSPICIOUS CONTENT / SPAM
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary)' }}>@{log.username}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>({log.userId})</span>
                        <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {log.action}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.82rem', color: 'white', margin: 0, lineHeight: 1.4 }}>
                      {log.description}
                    </p>

                    {log.isSuspicious && log.suspiciousReason && (
                      <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.05)', borderLeft: '3px solid var(--danger)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--danger-light)', fontWeight: 500 }}>
                        Reason: {log.suspiciousReason}
                      </div>
                    )}

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Payload Metadata</span>
                        <pre style={{ margin: '0.25rem 0 0 0', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', overflowX: 'auto', fontFamily: 'monospace' }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB TAB VIEW: THREAT CENTER */}
      {activeSubTab === 'threats' && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
            <ShieldAlert size={22} className="text-danger" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Active Threat Analysis &amp; Mitigation</h3>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            The AI engine and rate limits automatically flag suspicious user activities (such as SQL/script injections or flooding/spamming share requests). Inspect flags below to quickly isolate or block users.
          </p>

          {Object.keys(userThreatScores).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
              <UserCheck size={48} className="text-success" style={{ marginBottom: '0.75rem', opacity: 0.8 }} />
              <h4>All Systems Clear</h4>
              <p style={{ fontSize: '0.8rem', maxWidth: '360px', margin: '0.25rem auto 0' }}>No users have engaged in suspicious actions, SQL keywords injection attempts, or spam activity.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {Object.values(userThreatScores)
                .sort((a, b) => b.count - a.count)
                .map((threat) => {
                  const targetUserObj = usersList.find(u => u.id === threat.userId);
                  const isSuspended = targetUserObj?.status === 'suspended';

                  return (
                    <div 
                      key={threat.userId} 
                      style={{ 
                        padding: '1.25rem', 
                        background: isSuspended ? 'rgba(255,255,255,0.01)' : 'rgba(239, 68, 68, 0.02)',
                        border: '1px solid',
                        borderColor: isSuspended ? 'var(--border-light)' : 'rgba(239, 68, 68, 0.25)',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            @{threat.username}
                            {isSuspended ? (
                              <span style={{ fontSize: '0.62rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.3)' }}>ACCOUNT SUSPENDED</span>
                            ) : (
                              <span style={{ fontSize: '0.62rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(245, 158, 11, 0.3)' }}>HIGH RISK VALUE</span>
                            )}
                          </h4>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>User UID: {threat.userId}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Risk Incident Frequency</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)' }}>{threat.count} Flags</span>
                          </div>
                          {!isSuspended ? (
                            <button
                              onClick={() => handleToggleSuspension(targetUserObj)}
                              className="btn btn-danger"
                              style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
                            >
                              <UserMinus size={14} /> Suspend User Account
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleSuspension(targetUserObj)}
                              className="btn btn-secondary"
                              style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                            >
                              <UserCheck size={14} /> Reactivate User Account
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reasons Box */}
                      <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Suspicious Behaviors Detected</span>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.78rem', color: 'var(--danger-light)', lineHeight: 1.4 }}>
                          {Array.from(threat.reasons).map((reason, rIdx) => (
                            <li key={rIdx}>{reason}</li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        <span>Last detected threat: {new Date(threat.lastSeen).toLocaleString()}</span>
                        <span>Scope: Global DB Audit System</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
