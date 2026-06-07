import React, { useState } from 'react';
import { Sparkles, Key, Award, Clock, ArrowRight } from 'lucide-react';
import { API_BASE } from '../config';

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at top left, rgba(139, 92, 246, 0.08), transparent 40%), radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.08), transparent 40%), #0a0518',
      padding: '2rem'
    }}>
      <div className="glass-panel" style={{ 
        maxWidth: '900px', 
        width: '100%', 
        display: 'grid', 
        gridTemplateColumns: '1.2fr 1fr', 
        padding: 0, 
        overflow: 'hidden',
        minHeight: '520px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        borderColor: 'rgba(255,255,255,0.06)'
      }}>
        {/* Left Side: Welcoming Visual Onboarding */}
        <div style={{ 
          padding: '2.5rem', 
          background: 'rgba(255, 255, 255, 0.01)', 
          borderRight: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Sparkles size={24} className="text-primary animate-pulse" />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'white', margin: 0 }}>
                Verbalyst <span className="text-secondary">AI Coach</span>
              </h1>
            </div>
            
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '2rem' }}>
              Master technical and behavioral interviews with real-time speech analytics. 
              Speak your answers, and our AI auditor will evaluate your pacing, grammar, and theoretical accuracy instantly.
            </p>

            {/* Beginner Quick Guide Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Key size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white', margin: '0 0 2px 0' }}>1. Scoped Data Portability</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>All your mock reports, scores, and custom questions are stored securely under your account.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Award size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white', margin: '0 0 2px 0' }}>2. Strict Suggestion Grading</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>Add reference answers to test your factual accuracy against precise topics.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white', margin: '0 0 2px 0' }}>3. Real-Time Timeline Mocks</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>Simulate timed constraints and automatic question transitions with silence limits.</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2rem' }}>
            © 2026 Verbalyst Inc. Built for professional developers.
          </div>
        </div>

        {/* Right Side: Simple form */}
        <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', marginBottom: '0.5rem' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
            {isLogin ? 'Enter details to access your custom sandbox.' : 'Get started by creating your practice profile.'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Username
              </label>
              <input 
                type="text" 
                placeholder="e.g. nikhil"
                className="input-field" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: '100%' }}
                disabled={loading}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Password
              </label>
              <input 
                type="password" 
                placeholder="••••••••"
                className="input-field" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%' }}
                disabled={loading}
              />
            </div>

            {error && (
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--danger)', 
                background: 'rgba(239, 68, 68, 0.08)', 
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '8px 12px',
                borderRadius: '6px'
              }}>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
              disabled={loading}
            >
              {loading ? 'Processing...' : isLogin ? 'Log In' : 'Sign Up'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>
              {isLogin ? "Don't have an account? " : "Already have an profile? "}
            </span>
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--primary)', 
                fontWeight: 600, 
                cursor: 'pointer',
                padding: 0
              }}
              disabled={loading}
            >
              {isLogin ? 'Register here' : 'Log in here'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
