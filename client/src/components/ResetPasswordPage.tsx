import { useState } from 'react';
import { api } from '../api';

export function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm)  { setError('Passwords do not match.'); return; }
    if (password.length < 6)   { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      // Remove token from URL without reload
      window.history.replaceState({}, '', '/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('400'))      setError('This link is invalid or has already been used.');
      else if (msg.includes('410')) setError('This link has expired. Request a new one.');
      else                          setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14,
        padding: '40px 44px', width: 380, boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src="/myphoto.jpg" alt="Flow Tracker" style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.01em' }}>Flow Tracker</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>Password Reset</div>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Password changed!</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
              You can now sign in with your new password.
            </div>
            <button
              style={primaryBtn}
              onClick={() => window.location.href = '/'}
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20, lineHeight: 1.55 }}>
              Enter your new password below.
            </div>
            <form onSubmit={handleSubmit}>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                style={inputStyle}
              />
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                required
                style={{ ...inputStyle, marginBottom: 6 }}
              />

              {error && (
                <div style={{
                  fontSize: 12, color: 'var(--bad)', marginBottom: 12,
                  padding: '7px 10px', background: 'var(--bad-soft)',
                  border: '1px solid var(--bad-line)', borderRadius: 6,
                }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={primaryBtn}>
                {loading ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700,
  letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--ink-3)', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'var(--sans)', fontSize: 13,
  padding: '9px 11px', border: '1px solid var(--line)',
  borderRadius: 7, background: 'var(--panel)', color: 'var(--ink)',
  outline: 'none', marginBottom: 12, boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 8,
  padding: '10px 0', background: 'var(--blue-2)', color: '#fff',
  border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--sans)',
};
