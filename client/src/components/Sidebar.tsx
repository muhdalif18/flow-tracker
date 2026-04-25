import { useState } from "react";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import { flowStats, modStatus } from "../utils";

function NavIcoDash() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function NavIcoFlow() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="4" width="5" height="8" rx="1" />
      <rect x="9" y="4" width="5" height="8" rx="1" />
      <path d="M7 8h2" />
    </svg>
  );
}

function NavIcoTrace() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 7h6M5 10h4" strokeLinecap="round" />
    </svg>
  );
}

function NavIcoPlay() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="8" cy="8" r="6.3" />
      <path d="M7 5.5l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavIcoDoc() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M4 2h6l3 3v9H4V2z" />
      <path d="M10 2v3h3M6 8h5M6 11h5" />
    </svg>
  );
}

function NavIcoHelp() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="8" cy="8" r="6.3" />
      <path d="M6 6.3a2 2 0 113 1.7c-.5.3-1 .6-1 1.2" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Sidebar() {
  const { state, setActive, setTab, createFlow, deleteFlow } = useApp();
  const { user, isOwner, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createFlow(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setShowForm(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this flow and all its data?")) return;
    await deleteFlow(id);
  };

  const getDotColor = (flow: (typeof state.flows)[0]) => {
    const hasBlocker = flow.modules.some((m) => modStatus(m) === "blocked");
    const st = flowStats(flow);
    if (hasBlocker) return "#dc2626";
    if (st.fail > 0) return "#d97706";
    if (st.pass > 0 && st.untested === 0 && st.fail === 0) return "#16a34a";
    if (st.pass > 0) return "#1d4ed8";
    return "#475569";
  };

  return (
    <aside className="sidebar">
      {/* Brand header */}
      <div className="sb-header">
        <div className="sb-mark">FT</div>
        <div>
          <div className="sb-title">Flow Tracker</div>
          <div className="sb-sub">V2.4.0-STABLE</div>
        </div>
      </div>

      {/* Main nav */}
      <div className="side-section">Main</div>
      <nav className="nav">
        <div
          className={`nav-item ${state.activeTab === "blid" ? "on" : ""}`}
          onClick={() => setTab("blid")}
        >
          <NavIcoDash />
          Dashboard
        </div>
        {/* <div className="nav-item" onClick={() => setTab('diagram')}>
          <NavIcoFlow />
          Flow Selection
        </div> */}
        <div
          className={`nav-item ${state.activeTab === "diagram" ? "on" : ""}`}
          onClick={() => setTab("diagram")}
        >
          <NavIcoTrace />
          Traceability
        </div>
        <div
          className={`nav-item ${state.activeTab === "scenarios" ? "on" : ""}`}
          onClick={() => setTab("scenarios")}
        >
          <NavIcoPlay />
          Execution
        </div>
      </nav>

      {/* Flows list */}
      <div className="sb-section-label">Flows</div>
      <div className="flow-list">
        {state.loading && <div className="sb-empty">Loading…</div>}
        {!state.loading && state.flows.length === 0 && (
          <div className="sb-empty">
            No flows yet.
            <br />
            Create one below.
          </div>
        )}
        {state.flows.map((flow) => {
          const st = flowStats(flow);
          const dot = getDotColor(flow);
          const pct = st.total > 0 ? Math.round((st.pass / st.total) * 100) : 0;

          return (
            <div
              key={flow.id}
              className={`flow-item ${flow.id === state.activeFlowId ? "active" : ""}`}
              onClick={() => setActive(flow.id)}
            >
              <div className="fi-dot" style={{ background: dot }} />
              <div className="fi-info">
                <div className="fi-name">{flow.name}</div>
                {st.total > 0 && (
                  <div className="fi-progress">
                    <div
                      className="fi-progress-fill"
                      style={{ width: `${pct}%`, background: dot }}
                    />
                  </div>
                )}
              </div>
              {isOwner(flow.created_by) && (
                <button
                  className="fi-del"
                  onClick={(e) => handleDelete(e, flow.id)}
                  title="Delete flow"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showForm ? (
        <form className="sb-form" onSubmit={handleCreate}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Flow name *"
            required
            className="sb-input"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="sb-input"
          />
          <div className="sb-form-btns">
            <button
              type="button"
              className="sb-cancel"
              onClick={() => {
                setShowForm(false);
                setName("");
                setDesc("");
              }}
            >
              Cancel
            </button>
            <button type="submit" className="sb-create">
              Create
            </button>
          </div>
        </form>
      ) : (
        <button className="sb-new" onClick={() => setShowForm(true)}>
          + New Flow
        </button>
      )}

      <div className="side-spacer" />

      {/* Footer nav */}
      <div className="side-foot">
        <div style={{ padding: '6px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: 'var(--blue-2)',
            display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
          }}>
            {user?.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>Signed in</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{
              background: 'none', border: '1px solid var(--line)', borderRadius: 5,
              color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, padding: '3px 7px',
            }}
          >
            Out
          </button>
        </div>
        <nav className="nav" style={{ padding: 0 }}>
          <div className="nav-item">
            <NavIcoDoc />
            Documentation
          </div>
          <div className="nav-item">
            <NavIcoHelp />
            Support
          </div>
        </nav>
      </div>
    </aside>
  );
}
