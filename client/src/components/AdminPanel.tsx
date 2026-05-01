import { useState, useEffect } from 'react';
import { api } from '../api';

interface TesterUser {
  id: string;
  username: string;
  role: string;
  created_at: string;
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users,    setUsers]    = useState<TesterUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [newUser,  setNewUser]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const [changingPw,  setChangingPw]  = useState<string | null>(null);
  const [pwValue,     setPwValue]     = useState('');
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [deleteInput,   setDeleteInput]   = useState('');
  const [deleteAdminPw, setDeleteAdminPw] = useState('');
  const [deleteError,   setDeleteError]   = useState('');

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.adminGetUsers()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 3500); }
    else       { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  };

  const usernameTaken = newUser.trim().length >= 2 &&
    users.some(u => u.username.toLowerCase() === newUser.trim().toLowerCase());

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameTaken) return;
    setCreating(true);
    try {
      await api.adminCreateUser(newUser.trim(), newPass);
      setNewUser(''); setNewPass('');
      flash(`Account "${newUser.trim()}" created.`);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      flash(msg.includes('409') ? 'Username already taken.' : 'Failed to create account.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (u: TesterUser) => {
    if (deleteInput !== u.username || !deleteAdminPw) return;
    setDeleteError('');
    try {
      await api.adminDeleteUser(u.id, deleteAdminPw);
      setDeletingId(null);
      setDeleteInput('');
      setDeleteAdminPw('');
      setDeleteError('');
      flash(`Account "${u.username}" deleted.`);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setDeleteError(msg.includes('403') ? 'Incorrect admin password. Please try again.' : 'Failed to delete account. Try again.');
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!pwValue || pwValue.length < 4) { flash('Password must be at least 4 characters.', true); return; }
    try {
      await api.adminChangePassword(userId, pwValue);
      setChangingPw(null); setPwValue('');
      flash(`Password for "${username}" has been reset.`);
    } catch { flash('Failed to reset password.', true); }
  };

  const testers = users.filter(u => u.role !== 'admin');
  const admins  = users.filter(u => u.role === 'admin');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: 520, maxHeight: '88vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>User Management</h3>
          <button className="btn-xs" onClick={onClose}>✕</button>
        </div>

        {error   && <div style={msgStyle('bad')}>{error}</div>}
        {success && <div style={msgStyle('ok')}>{success}</div>}

        {/* Create new tester */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>Create Tester Account</div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <input
                value={newUser}
                onChange={e => setNewUser(e.target.value)}
                placeholder="Username"
                required
                minLength={2}
                style={{
                  ...inputStyle,
                  borderColor: usernameTaken ? 'var(--bad)' : undefined,
                  boxShadow: usernameTaken ? '0 0 0 3px rgba(220,38,38,.1)' : undefined,
                }}
              />
              {usernameTaken && (
                <div style={{ fontSize: 11.5, color: 'var(--bad)', marginTop: 4 }}>
                  ✕ Username "{newUser.trim()}" is already taken.
                </div>
              )}
            </div>
            <input
              type="password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="Password (min 4 chars)"
              required
              minLength={4}
              style={inputStyle}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={creating || usernameTaken}
              style={{ alignSelf: 'flex-end' }}
            >
              {creating ? 'Creating…' : '+ Create Account'}
            </button>
          </form>
        </div>

        {/* Tester accounts */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>Tester Accounts ({testers.length})</div>
          {loading ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>Loading…</div>
          ) : testers.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>No tester accounts yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Username', 'Created', 'Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testers.map(u => (
                  <>
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            className="btn-xs"
                            onClick={() => { setChangingPw(changingPw === u.id ? null : u.id); setPwValue(''); setDeletingId(null); setDeleteInput(''); }}
                          >
                            {changingPw === u.id ? 'Cancel' : '🔑 Reset Password'}
                          </button>
                          <button
                            className="btn-xs btn-danger"
                            onClick={() => {
                              setDeletingId(deletingId === u.id ? null : u.id);
                              setDeleteInput('');
                              setDeleteAdminPw('');
                              setDeleteError('');
                              setChangingPw(null);
                            }}
                          >
                            {deletingId === u.id ? 'Cancel' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {deletingId === u.id && (
                      <tr key={`${u.id}-del`}>
                        <td colSpan={3} style={{ padding: '10px 12px 12px', background: 'rgba(220,38,38,.04)', borderLeft: '3px solid var(--bad)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bad)', marginBottom: 4 }}>
                            ⚠ This action is permanent and cannot be undone.
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10 }}>
                            Type <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{u.username}</strong> to confirm deletion.
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input
                              autoFocus
                              value={deleteInput}
                              onChange={e => setDeleteInput(e.target.value)}
                              placeholder={`Type "${u.username}" to confirm`}
                              style={{ ...inputStyle, borderColor: deleteInput && deleteInput !== u.username ? 'var(--bad)' : undefined }}
                            />
                            <input
                              type="password"
                              value={deleteAdminPw}
                              onChange={e => { setDeleteAdminPw(e.target.value); setDeleteError(''); }}
                              placeholder="Enter your admin password"
                              style={{ ...inputStyle, borderColor: deleteError ? 'var(--bad)' : undefined }}
                              onKeyDown={e => { if (e.key === 'Enter') handleDelete(u); }}
                            />
                            {deleteError && (
                              <div style={{ fontSize: 12, color: 'var(--bad)', padding: '6px 10px', background: 'var(--bad-soft)', border: '1px solid var(--bad-line)', borderRadius: 6 }}>
                                {deleteError}
                              </div>
                            )}
                            <button
                              style={{
                                padding: '9px 14px', fontSize: 12, fontWeight: 600,
                                background: deleteInput === u.username && deleteAdminPw ? 'var(--bad)' : 'var(--line-2)',
                                color: deleteInput === u.username && deleteAdminPw ? '#fff' : 'var(--ink-3)',
                                border: 'none', borderRadius: 7, fontFamily: 'var(--sans)', transition: 'all .15s',
                                cursor: deleteInput === u.username && deleteAdminPw ? 'pointer' : 'not-allowed',
                              }}
                              disabled={deleteInput !== u.username || !deleteAdminPw}
                              onClick={() => handleDelete(u)}
                            >
                              Confirm Delete Account
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {changingPw === u.id && (
                      <tr key={`${u.id}-pw`}>
                        <td colSpan={3} style={{ padding: '8px 10px 10px', background: 'var(--hover)' }}>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 6 }}>
                            Set a new password for <strong>{u.username}</strong>. Share it with them directly.
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="password"
                              value={pwValue}
                              onChange={e => setPwValue(e.target.value)}
                              placeholder="New password (min 4 chars)"
                              style={{ ...inputStyle, flex: 1 }}
                              autoFocus
                            />
                            <button
                              className="btn-primary"
                              style={{ padding: '8px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
                              onClick={() => handleResetPassword(u.id, u.username)}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Admin accounts */}
        <div style={{ ...sectionStyle, borderBottom: 'none', paddingBottom: 0 }}>
          <div style={sectionTitle}>Admin Accounts ({admins.length})</div>
          {admins.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{u.username}</span>
              <span style={{ fontSize: 10, background: 'rgba(29,78,216,.1)', color: 'var(--blue-2)', border: '1px solid rgba(29,78,216,.2)', padding: '1px 6px', borderRadius: 99 }}>admin</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>password reset via email</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
  color: 'var(--ink-3)', marginBottom: 10,
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'var(--sans)', fontSize: 13,
  padding: '8px 11px', border: '1px solid var(--line)',
  borderRadius: 7, background: 'var(--panel)', color: 'var(--ink)',
  outline: 'none', boxSizing: 'border-box',
};
const thStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--ink-3)', padding: '6px 10px', background: 'var(--hover)',
  textAlign: 'left', borderBottom: '1px solid var(--line)',
};
const tdStyle: React.CSSProperties = { padding: '9px 10px', verticalAlign: 'middle' };
const msgStyle = (type: 'ok' | 'bad'): React.CSSProperties => ({
  fontSize: 12, padding: '7px 10px', borderRadius: 6, marginBottom: 12,
  color: `var(--${type})`, background: `var(--${type}-soft)`,
  border: `1px solid var(--${type}-line)`,
});
