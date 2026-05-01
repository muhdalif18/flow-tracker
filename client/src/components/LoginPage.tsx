import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';

type View = 'login' | 'forgot';

const IS_ADMIN_RESET = new URLSearchParams(window.location.search).has('admin_reset');

export function LoginPage() {
  const { login } = useAuth();
  const [view,     setView]    = useState<View>('login');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Forgot password state
  const [fpEmail,   setFpEmail]  = useState('');
  const [fpError,   setFpError]  = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpSent,    setFpSent]   = useState(false);

  const switchView = (v: View) => {
    setView(v);
    setError('');
    setFpError('');
    setFpSent(false);
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username.trim(), password);
    if (result === 'wrong_credentials') setError('Incorrect username or password.');
    else if (result === 'error')        setError('Could not connect. Please try again.');
    setLoading(false);
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
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
              V2.4.0-STABLE
            </div>
          </div>
        </div>

        {view === 'login' ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>
              Sign in to access the workspace.
            </div>
            <form onSubmit={submitLogin}>
              <label style={labelStyle}>Username</label>
              <input
                autoFocus
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username…"
                required
                style={inputStyle}
              />
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password…"
                required
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              {error && <div style={errorStyle}>{error}</div>}
              <button type="submit" disabled={loading} style={primaryBtn}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div style={{
              marginTop: 16, padding: '12px 14px', background: 'var(--hover)',
              borderRadius: 8, fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6,
            }}>
              Forgot your password? Contact your administrator to reset it.
              {IS_ADMIN_RESET && (
                <> · <button type="button" onClick={() => switchView('forgot')} style={{ ...linkBtn, fontSize: 11.5, textDecoration: 'underline' }}>
                  Admin reset
                </button></>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Forgot Password</div>

            {fpSent ? (
              <div style={{ padding: '12px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 10, textAlign: 'center' }}>📬</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>
                  Check your inbox!
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6, textAlign: 'center' }}>
                  A reset link has been sent to <strong>{fpEmail}</strong>.<br />
                  The link expires in 1 hour.
                </div>
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  style={{ ...primaryBtn, marginTop: 20 }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20, lineHeight: 1.55 }}>
                  Enter your email address and we'll send you a password reset link.
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setFpError('');
                  setFpLoading(true);
                  try {
                    await api.forgotPassword(fpEmail.trim());
                    setFpSent(true);
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : '';
                    if (msg.includes('404'))      setFpError('No account found with that email. Contact your administrator.');
                    else if (msg.includes('503')) setFpError('Email not configured on server. Contact your system administrator.');
                    else                          setFpError('Something went wrong. Please try again.');
                  } finally {
                    setFpLoading(false);
                  }
                }}>
                  <label style={labelStyle}>Email Address</label>
                  <input
                    autoFocus
                    type="email"
                    value={fpEmail}
                    onChange={e => setFpEmail(e.target.value)}
                    placeholder="Enter your email…"
                    required
                    style={{ ...inputStyle, marginBottom: 6 }}
                  />
                  {fpError && <div style={errorStyle}>{fpError}</div>}
                  <button type="submit" disabled={fpLoading} style={primaryBtn}>
                    {fpLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <button type="button" onClick={() => switchView('login')} style={linkBtn}>
                    ← Back to Sign In
                  </button>
                </div>
              </>
            )}
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
const errorStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--bad)', marginBottom: 12,
  padding: '7px 10px', background: 'var(--bad-soft)',
  border: '1px solid var(--bad-line)', borderRadius: 6,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 8,
  padding: '10px 0', background: 'var(--blue-2)', color: '#fff',
  border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--sans)',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--blue-2)',
  fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
};
