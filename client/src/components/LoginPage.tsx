import { useState } from 'react';
import { useAuth } from '../AuthContext';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode,     setMode]     = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const switchMode = (m: Mode) => { setMode(m); setError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const result = await login(username.trim(), password);
      if (result === 'wrong_credentials') setError('Incorrect username or password.');
      else if (result === 'error')        setError('Could not connect. Please try again.');
    } else {
      const result = await register(username.trim(), password);
      if (result === 'taken')   setError('Username is already taken. Choose another.');
      else if (result === 'invalid') setError('Username must be ≥ 2 chars, password ≥ 4 chars.');
      else if (result === 'error')   setError('Could not connect. Please try again.');
    }
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
          <div style={{
            width: 38, height: 38, borderRadius: 8, background: 'var(--blue-2)',
            display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 15,
          }}>FT</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.01em' }}>Flow Tracker</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
              V2.4.0-STABLE
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--hover)', borderRadius: 8, padding: 3 }}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--sans)',
                background: mode === m ? 'var(--panel)' : 'transparent',
                color: mode === m ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: mode === m ? 'var(--shadow)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>
          {mode === 'login'
            ? 'Enter your credentials to access the workspace.'
            : 'Create your account to start collaborating.'}
        </div>

        <form onSubmit={submit}>
          <label style={{
            display: 'block', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase',
            color: 'var(--ink-3)', marginBottom: 6,
          }}>Username</label>
          <input
            autoFocus
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter username…"
            required
            style={{
              width: '100%', fontFamily: 'var(--sans)', fontSize: 13,
              padding: '9px 11px', border: '1px solid var(--line)',
              borderRadius: 7, background: 'var(--panel)', color: 'var(--ink)',
              outline: 'none', marginBottom: 10, boxSizing: 'border-box',
            }}
          />

          <label style={{
            display: 'block', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase',
            color: 'var(--ink-3)', marginBottom: 6,
          }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password…"
            required
            style={{
              width: '100%', fontFamily: 'var(--sans)', fontSize: 13,
              padding: '9px 11px', border: '1px solid var(--line)',
              borderRadius: 7, background: 'var(--panel)', color: 'var(--ink)',
              outline: 'none', marginBottom: 6, boxSizing: 'border-box',
            }}
          />

          {error && (
            <div style={{
              fontSize: 12, color: 'var(--bad)', marginBottom: 12,
              padding: '7px 10px', background: 'var(--bad-soft)',
              border: '1px solid var(--bad-line)', borderRadius: 6,
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', marginTop: 8,
              padding: '10px 0', background: 'var(--blue-2)', color: '#fff',
              border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1,
              fontFamily: 'var(--sans)',
            }}
          >
            {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{
          marginTop: 22, padding: '12px 14px', background: 'var(--hover)',
          borderRadius: 8, fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6,
        }}>
          Everyone can create their own modules and test scenarios. You can only edit content you added yourself.
        </div>
      </div>
    </div>
  );
}
