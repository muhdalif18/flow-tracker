import { useState, useEffect, useRef } from "react";
import { AppProvider, useApp } from "./AppContext";
import { AuthProvider, useAuth } from "./AuthContext";
import { LoginPage } from "./components/LoginPage";
import { Sidebar } from "./components/Sidebar";
import { FlowDiagram } from "./components/FlowDiagram";
import { ScenariosView } from "./components/ScenariosView";
import { BLIDDashboard } from "./components/BLIDDashboard";
import OverviewDashboard from "./components/OverviewDashboard";
import { AdminPanel } from "./components/AdminPanel";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { exportReport, exportExcel } from "./exportReport";

const QUICK = [
  { l: "M3", n: "e-DS Dashboard", s: "eDS" },
  { l: "M7", n: "Permohonan Bantahan dan Rayuan", s: "eDS" },
  { l: "M8", n: "Permohonan Pindaan", s: "eDS" },
  { l: "M9", n: "Permohonan Bayaran Balik", s: "eDS" },
  { l: "M10", n: "Permohonan Pembatalan", s: "eDS" },
  { l: "M17", n: "Taksiran Duti Setem", s: "HITS" },
  { l: "M18", n: "Penalti Duti Setem", s: "HITS" },
  { l: "M19", n: "Endorsemen", s: "HITS" },
  { l: "M20", n: "Resitan", s: "HITS" },
  { l: "M21", n: "Bantahan dan Rayuan", s: "HITS" },
  { l: "M22", n: "Pindaan Duti Setem", s: "HITS" },
  { l: "M23", n: "Bayaran Balik", s: "HITS" },
  { l: "M24", n: "Pembatalan Duti Setem", s: "HITS" },
  { l: "M25", n: "Nombor Bil dan e-Billing", s: "HITS" },
  { l: "M26", n: "Lejar", s: "HITS" },
];

/* SVG icon sprite — referenced via <use href="#i-*"> */
function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <defs>
        <symbol id="i-search" viewBox="0 0 16 16">
          <circle
            cx="7"
            cy="7"
            r="4.5"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M10.5 10.5L13 13"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-bell" viewBox="0 0 16 16">
          <path
            d="M4 11V7a4 4 0 118 0v4l1 1H3l1-1z"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinejoin="round"
          />
          <path
            d="M7 13.5a1 1 0 002 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="2.3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-download" viewBox="0 0 16 16">
          <path
            d="M8 2v9M4 7l4 4 4-4M3 14h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-check" viewBox="0 0 16 16">
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-double-check" viewBox="0 0 16 16">
          <path
            d="M1.5 9l2.5 2.5 5-5M6.5 9l2.5 2.5 5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-alert" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6.3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M8 5v4M8 10.5v.7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-filter" viewBox="0 0 16 16">
          <path
            d="M2 4h12M4 8h8M6 12h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-sort" viewBox="0 0 16 16">
          <path
            d="M3 4h10M3 8h7M3 12h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="3.2"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 16 16">
          <path
            d="M13.5 10.5A6 6 0 016.5 2a6 6 0 007 8.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}

function AddModuleModal({
  flowId,
  onClose,
}: {
  flowId: string;
  onClose: () => void;
}) {
  const { addModule, state } = useApp();
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState<"eDS" | "HITS">("eDS");
  const [note, setNote] = useState("");
  const [parGroup, setParGroup] = useState("");
  const [saving, setSaving] = useState(false);

  const activeFlow = state.flows.find((f) => f.id === flowId);
  const existingGroups = Array.from(
    new Set(
      (activeFlow?.modules ?? [])
        .map((m) => m.parallel_group)
        .filter(Boolean) as string[],
    ),
  );

  const fill = (l: string, n: string, s: string) => {
    setLabel(l);
    setName(n);
    setSide(s as "eDS" | "HITS");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await addModule(flowId, {
      label: label.trim(),
      name: name.trim(),
      side,
      note: note.trim(),
      parallel_group: parGroup.trim() || undefined,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>Add Module</h3>
        <div className="quick-row">
          <span className="label-hint">Quick fill:</span>
          {QUICK.map((q) => (
            <button
              key={q.l}
              type="button"
              className="quick-btn"
              onClick={() => fill(q.l, q.n, q.s)}
            >
              {q.l}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row-2">
            <div>
              <label>Module ID</label>
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="M7"
                className="mono-input"
                required
                style={{ width: 90 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Module name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rayuan Lanjutan Masa Bayaran"
                required
              />
            </div>
          </div>
          <div className="form-row-2">
            <div>
              <label>System side</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "eDS" | "HITS")}
                style={{ width: 100 }}
              >
                <option value="eDS">eDS</option>
                <option value="HITS">HITS</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>
                Note <span className="label-hint">(optional)</span>
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. First Time?"
              />
            </div>
          </div>
          <div className="form-row-2">
            <div style={{ flex: 1 }}>
              <label>
                Parallel Group{" "}
                <span className="label-hint">
                  (optional — same name = run in parallel)
                </span>
              </label>
              <input
                list="par-group-list"
                value={parGroup}
                onChange={(e) => setParGroup(e.target.value)}
                placeholder="e.g. branch-A"
              />
              <datalist id="par-group-list">
                {existingGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Adding…" : "Add Module"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportPreviewModal({ flow, onClose }: { flow: NonNullable<ReturnType<typeof useApp>['activeFlow']>; onClose: () => void }) {
  const { state } = useApp();
  const [inclFailed,  setInclFailed]  = useState(false);
  const [useGroup,    setUseGroup]    = useState(false);
  const [format, setFormat] = useState<'html' | 'excel'>('html');

  const groupName   = flow.group_name?.trim();
  const groupFlows  = groupName ? state.flows.filter(f => f.group_name?.trim() === groupName) : [flow];
  const hasGroup    = groupFlows.length > 1;
  const targetFlows = useGroup && hasGroup ? groupFlows : [flow];

  const totalMods  = targetFlows.reduce((n, f) => n + f.modules.length, 0);
  const totalSc    = targetFlows.reduce((n, f) => f.modules.reduce((n2, m) => n2 + m.scenarios.length, n), 0);
  const totalSteps = targetFlows.reduce((n, f) => f.modules.reduce((n2, m) => m.scenarios.reduce((n3, s) => n3 + s.steps.length, n2), n), 0);

  const doExport = () => {
    const target = useGroup && hasGroup ? groupFlows : flow;
    if (format === 'html') {
      exportReport(target, { onlyFailed: inclFailed });
    } else {
      exportExcel(useGroup && hasGroup
        ? { ...flow, name: groupName!, modules: groupFlows.flatMap(f => f.modules) } as typeof flow
        : flow
      );
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="rp-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="rp-header">
          <div className="rp-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="rp-title">Export Report</span>
          </div>
          <button className="rp-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="rp-body">
          {/* Source */}
          <div className="rp-field">
            <div className="rp-field-label">Source</div>
            <div className="rp-source-box">
              <div className="rp-source-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="rp-source-info">
                <span className="rp-source-name">{useGroup && hasGroup ? groupName : flow.name}</span>
                <span className="rp-source-meta">
                  {useGroup && hasGroup
                    ? `${groupFlows.length} flows · ${totalMods} modules`
                    : `${flow.group_name ? flow.group_name + ' · ' : ''}${flow.modules.length} modules`}
                </span>
              </div>
            </div>
            {hasGroup && (
              <label className="rp-option-row" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={useGroup} onChange={e => setUseGroup(e.target.checked)} />
                <div>
                  <span className="rp-option-text">Include all flows in this group</span>
                  <ul className="rp-option-sub rp-flow-list">
                    {groupFlows.map(f => (
                      <li key={f.id}>{f.name}</li>
                    ))}
                  </ul>
                </div>
              </label>
            )}
          </div>

          {/* Format */}
          <div className="rp-field">
            <div className="rp-field-label">Format</div>
            <div className="rp-format-row">
              <button className={`rp-format-card ${format === 'html' ? 'on' : ''}`} onClick={() => setFormat('html')}>
                <div className="rp-format-icon rp-format-icon--html">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                </div>
                <span className="rp-format-name">HTML Report</span>
                <span className="rp-format-sub">Print-ready, shareable</span>
              </button>
              <button className={`rp-format-card ${format === 'excel' ? 'on' : ''}`} onClick={() => setFormat('excel')}>
                <div className="rp-format-icon rp-format-icon--excel">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                  </svg>
                </div>
                <span className="rp-format-name">Excel (.xlsx)</span>
                <span className="rp-format-sub">3 sheets: Summary, Scenarios, Steps</span>
              </button>
            </div>
          </div>

          {/* Options — HTML only */}
          {format === 'html' && (
            <div className="rp-field">
              <div className="rp-field-label">Options</div>
              <label className="rp-option-row">
                <input type="checkbox" checked={inclFailed} onChange={e => setInclFailed(e.target.checked)} />
                <div>
                  <span className="rp-option-text">Failed scenarios only</span>
                  <span className="rp-option-sub">Exclude passed and untested scenarios from the report</span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rp-footer">
          <div className="rp-footer-stats">
            <span>{totalMods} module{totalMods !== 1 ? 's' : ''}</span>
            <span className="rp-dot" />
            <span>{totalSc} scenario{totalSc !== 1 ? 's' : ''}</span>
            <span className="rp-dot" />
            <span>{totalSteps} step{totalSteps !== 1 ? 's' : ''}</span>
          </div>
          <div className="rp-footer-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={doExport}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainPanel({
  dark,
  onToggleTheme,
}: {
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const { activeFlow, state, setTab, setSearch } = useApp();
  const { isOwner, isAdmin } = useAuth();
  const [showAddMod,     setShowAddMod]     = useState(false);
  const [showExport,     setShowExport]     = useState(false);
  const [showAdmin,      setShowAdmin]      = useState(false);
  const [showPreview,    setShowPreview]    = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  if (state.loading) {
    return (
      <main className="main-panel">
        <div className="top">
          <div
            className="top-tabs"
            style={{ flex: 1, justifyContent: "center" }}
          >
            <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
              Loading…
            </span>
          </div>
        </div>
        <div className="content">
          <div className="empty-state">
            <div className="es-title">Loading flows…</div>
          </div>
        </div>
      </main>
    );
  }

  const flowInitial = activeFlow ? activeFlow.name[0].toUpperCase() : "FT";

  return (
    <main className="main-panel">
      {/* Top bar */}
      <div className="top">
        <div className="search">
          <svg width="14" height="14" color="var(--ink-4)">
            <use href="#i-search" />
          </svg>
          <input
            ref={searchRef}
            placeholder="Search modules, BLIDs, scenarios, steps..."
            value={state.searchQuery}
            onChange={e => { setSearch(e.target.value); if (activeFlow) setTab('scenarios'); }}
            onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); if (searchRef.current) searchRef.current.blur(); } }}
          />
          {state.searchQuery && (
            <button className="search-clear" onClick={() => setSearch('')} title="Clear search">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          )}
        </div>

        <div className="top-tabs">
          <button
            className={`ttab ${state.activeTab === "overview" ? "on" : ""}`}
            onClick={() => setTab("overview")}
            disabled={!activeFlow}
          >
            Overview
          </button>
          <button
            className={`ttab ${state.activeTab === "diagram" ? "on" : ""}`}
            onClick={() => setTab("diagram")}
            disabled={!activeFlow}
          >
            Flow Diagram
          </button>
          <button
            className={`ttab ${state.activeTab === "scenarios" ? "on" : ""}`}
            onClick={() => setTab("scenarios")}
            disabled={!activeFlow}
          >
            Test Scenarios
          </button>
          <button
            className={`ttab ${state.activeTab === "blid" ? "on" : ""}`}
            onClick={() => setTab("blid")}
            disabled={!activeFlow}
          >
            BLID Coverage
          </button>
        </div>

        <div className="top-right">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <svg>
              <use href={dark ? "#i-sun" : "#i-moon"} />
            </svg>
          </button>
          <button className="icon-btn" title="Notifications">
            <svg>
              <use href="#i-bell" />
            </svg>
          </button>
          {isAdmin && (
            <button
              className="btn-sm"
              style={{ background: 'rgba(29,78,216,.1)', color: 'var(--blue-2)', border: '1px solid rgba(29,78,216,.25)' }}
              onClick={() => setShowAdmin(true)}
              title="User management"
            >
              👥 Users
            </button>
          )}
          {activeFlow && isOwner(activeFlow.created_by) && (
            <button className="btn-sm" onClick={() => setShowAddMod(true)}>
              + Module
            </button>
          )}
          <button
            className="btn-export"
            onClick={() => activeFlow && setShowPreview(true)}
            disabled={!activeFlow}
          >
            <svg><use href="#i-download" /></svg>
            Export Report
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="content">
        {!activeFlow ? (
          <div className="empty-state">
            <div className="es-icon">🔀</div>
            <div className="es-title">Welcome to Flow Tracker</div>
            <div className="es-sub">
              Create a flow in the sidebar to start building your traceability
              matrix
            </div>
          </div>
        ) : (
          <>
            {state.activeTab === "overview"   && <OverviewDashboard />}
            {state.activeTab === "diagram"    && <FlowDiagram />}
            {state.activeTab === "scenarios"  && <ScenariosView />}
            {state.activeTab === "blid"       && <BLIDDashboard />}
          </>
        )}
      </div>

      {showAddMod && activeFlow && (
        <AddModuleModal
          flowId={activeFlow.id}
          onClose={() => setShowAddMod(false)}
        />
      )}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showPreview && activeFlow && (
        <ReportPreviewModal flow={activeFlow} onClose={() => setShowPreview(false)} />
      )}
    </main>
  );
}

function AuthGate({
  dark,
  onToggleTheme,
}: {
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const { user } = useAuth();

  const resetToken = new URLSearchParams(window.location.search).get('reset_token');
  if (resetToken) return <ResetPasswordPage token={resetToken} />;

  if (!user) return <LoginPage />;

  return (
    <AppProvider>
      <IconSprite />
      <div className="app-layout">
        <Sidebar />
        <MainPanel dark={dark} onToggleTheme={onToggleTheme} />
      </div>
    </AppProvider>
  );
}

export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <AuthProvider>
      <AuthGate dark={dark} onToggleTheme={() => setDark((d) => !d)} />
    </AuthProvider>
  );
}
