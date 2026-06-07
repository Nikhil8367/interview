import React, { useState } from 'react';
import { Sparkles, Key, Award, Clock, ArrowRight } from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { PRESETS } from './QuestionManager';

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userRef);
      let userData;
      
      if (!userDoc.exists()) {
        const usernameVal = firebaseUser.displayName || firebaseUser.email.split('@')[0];
        userData = {
          id: firebaseUser.uid,
          username: usernameVal,
          email: firebaseUser.email,
          createdAt: new Date().toISOString()
        };
        await setDoc(userRef, userData);

        // Seed default questions
        const batch = writeBatch(db);
        PRESETS.forEach(p => {
          const qId = `q_${p.id}_${firebaseUser.uid}`;
          const qRef = doc(db, 'questions', qId);
          batch.set(qRef, {
            ...p,
            id: qId,
            userId: firebaseUser.uid
          });
        });
        await batch.commit();
      } else {
        userData = userDoc.data();
      }

      onLogin({ id: userData.id, username: userData.username });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    
    // Normalize to a valid email string for Firebase Auth
    const email = username.includes('@') ? username.trim().toLowerCase() : `${username.trim().toLowerCase()}@verbalyst.com`;

    try {
      if (isLogin) {
        // Sign in via Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        // Fetch user doc
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        let userData;
        if (userDoc.exists()) {
          userData = userDoc.data();
        } else {
          userData = { id: firebaseUser.uid, username: username.trim() };
        }
        onLogin({ id: userData.id, username: userData.username });
      } else {
        // Register in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        const userData = {
          id: firebaseUser.uid,
          username: username.trim(),
          usernameNormalized: username.trim().toLowerCase(),
          email: firebaseUser.email,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), userData);

        // Seed default questions
        const batch = writeBatch(db);
        PRESETS.forEach(p => {
          const qId = `q_${p.id}_${firebaseUser.uid}`;
          const qRef = doc(db, 'questions', qId);
          batch.set(qRef, {
            ...p,
            id: qId,
            userId: firebaseUser.uid
          });
        });
        await batch.commit();

        onLogin({ id: userData.id, username: userData.username });
      }
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') {
        msg = 'Invalid username/email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'Email/Username already registered.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      }
      setError(msg);
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

          <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }}></div>
            <span style={{ padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }}></div>
          </div>

          <button 
            type="button" 
            onClick={handleGoogleSignIn}
            className="btn btn-secondary" 
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-light)',
              color: 'white',
              fontSize: '0.85rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: '8px' }}>
              <path fill="#EA4335" d="M12 5.04c1.67 0 3.2.58 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.4 7.56l3.86 3C6.18 7.59 8.85 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.47h6.46c-.28 1.48-1.12 2.74-2.38 3.58l3.69 2.87c2.16-1.99 3.72-4.92 3.72-8.58z" />
              <path fill="#FBBC05" d="M5.26 14.12c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3L1.4 6.52C.51 8.28 0 10.08 0 12s.51 3.72 1.4 5.48l3.86-3.36z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.87c-1.02.68-2.33 1.09-3.96 1.09-3.15 0-5.82-2.55-6.74-5.52L1.7 16.15C3.67 20.06 7.65 23 12 23z" />
            </svg>
            Continue with Google
          </button>

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
