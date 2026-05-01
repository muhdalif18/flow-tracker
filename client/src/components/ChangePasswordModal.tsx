import { useState } from 'react';
import { api } from '../api';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm)        { setError('New passwords do not match.'); return; }
    if (next.length < 4)         { setError('New password must be at least 4 characters.'); return; }
    if (next === current)        { setError('New password must be different from current.'); return; }

    setLoading(true);
    try {
      await api.changePassword(current, next);
      setSuccess(true);
      setTimeout(onClose, 1600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg.includes('401') ? 'Current password is incorrect.' : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
        <h3>Change Password</h3>

        {success ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ok)', fontSize: 14, fontWeight: 600 }}>
            ✓ Password changed successfully!
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Current Password</label>
              <input
                type="password"
                autoFocus
                value={current}
                onChange={e => setCurrent(e.target.value)}
                placeholder="Enter current password"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={next}
                onChange={e => setNext(e.target.value)}
                placeholder="Min 4 characters"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                required
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 12, color: 'var(--bad)', padding: '7px 10px',
                background: 'var(--bad-soft)', border: '1px solid var(--bad-line)', borderRadius: 6,
              }}>
                {error}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700,
  letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--ink-3)', marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'var(--sans)', fontSize: 13,
  padding: '8px 11px', border: '1px solid var(--line)',
  borderRadius: 7, background: 'var(--panel)', color: 'var(--ink)',
  outline: 'none', boxSizing: 'border-box',
};
