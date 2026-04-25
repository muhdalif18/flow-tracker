import { useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import { Sidebar } from './components/Sidebar';
import { FlowDiagram } from './components/FlowDiagram';
import { ScenariosView } from './components/ScenariosView';
import { BLIDDashboard } from './components/BLIDDashboard';
import { flowStats, modStatus } from './utils';

// ── Add Module modal (used from header button) ────────────────────────────
const QUICK = [
  { l: 'M7',  n: 'Rayuan Lanjutan Masa Bayaran', s: 'eDS'  },
  { l: 'M21', n: 'Receive & Review Application',  s: 'HITS' },
  { l: 'M3',  n: 'Status Update',                 s: 'eDS'  },
  { l: 'M25', n: 'Update No. Bil',                s: 'HITS' },
  { l: 'M22', n: 'Payment',                        s: 'eDS'  },
  { l: 'M30', n: 'Update Ledger (Credit)',          s: 'HITS' },
  { l: 'M17', n: 'Taksiran Pindaan',               s: 'HITS' },
  { l: 'M8',  n: 'Permohonan Pindaan',             s: 'eDS'  },
];

function AddModuleModal({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const { addModule } = useApp();
  const [label, setLabel] = useState('');
  const [name,  setName]  = useState('');
  const [side,  setSide]  = useState<'eDS' | 'HITS'>('eDS');
  const [note,  setNote]  = useState('');
  const [saving, setSaving] = useState(false);

  const fill = (l: string, n: string, s: string) => {
    setLabel(l); setName(n); setSide(s as 'eDS' | 'HITS');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await addModule(flowId, { label: label.trim(), name: name.trim(), side, note: note.trim() });
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Add module to flow</h3>
        <div className="quick-row">
          <span className="label-hint">Quick fill:</span>
          {QUICK.map(q => (
            <button key={q.l} type="button" className="quick-btn" onClick={() => fill(q.l, q.n, q.s)}>{q.l}</button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row-2">
            <div>
              <label>Module ID</label>
              <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="M7" className="mono-input" required style={{ width: 90 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Module name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rayuan Lanjutan Masa Bayaran" required />
            </div>
          </div>
          <div className="form-row-2">
            <div>
              <label>System side</label>
              <select value={side} onChange={e => setSide(e.target.value as 'eDS' | 'HITS')} style={{ width: 100 }}>
                <option value="eDS">eDS</option>
                <option value="HITS">HITS</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. First Time?" />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
function MainPanel() {
  const { activeFlow, state, setTab } = useApp();
  const [showAddMod, setShowAddMod] = useState(false);

  if (state.loading) {
    return (
      <main className="main-panel">
        <div className="empty-state">
          <div className="es-icon">⏳</div>
          <div className="es-title">Loading…</div>
        </div>
      </main>
    );
  }

  if (!activeFlow) {
    return (
      <main className="main-panel">
        <div className="empty-state">
          <div className="es-icon">🔀</div>
          <div className="es-title">Welcome to Flow Tracker</div>
          <div className="es-sub">Create a flow in the sidebar to start building your traceability matrix</div>
        </div>
      </main>
    );
  }

  const st = flowStats(activeFlow);
  const hasBlocker = activeFlow.modules.some(m => modStatus(m) === 'blocked');
  const allDone    = activeFlow.modules.length > 0 && st.total > 0 && st.untested === 0 && st.fail === 0;
  const hasFail    = st.fail > 0;

  let pillClass = 'hp-none', pillLabel = 'Not started';
  if (allDone)      { pillClass = 'hp-pass'; pillLabel = '✓ All Complete'; }
  else if (hasBlocker) { pillClass = 'hp-fail'; pillLabel = '🔒 Blocker'; }
  else if (hasFail) { pillClass = 'hp-warn'; pillLabel = `⚠ ${st.fail} Failing`; }
  else if (st.pass) { pillClass = 'hp-info'; pillLabel = `${st.execPct}% Tested`; }

  return (
    <main className="main-panel">
      {/* Header */}
      <div className="main-header">
        <div className="mh-left">
          <div className="mh-title">{activeFlow.name}</div>
          {activeFlow.description && <div className="mh-sub">{activeFlow.description}</div>}
        </div>
        <div className="mh-right">
          <span className={`hpill ${pillClass}`}>{pillLabel}</span>
          <button className="btn-sm" onClick={() => setShowAddMod(true)}>+ Add Module</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab ${state.activeTab === 'diagram'   ? 'on' : ''}`} onClick={() => setTab('diagram')}>🔀 Flow Diagram</button>
        <button className={`tab ${state.activeTab === 'scenarios' ? 'on' : ''}`} onClick={() => setTab('scenarios')}>
          📋 Test Scenarios
          {st.fail > 0 && <span className="tab-badge">{st.fail}</span>}
        </button>
        <button className={`tab ${state.activeTab === 'blid'      ? 'on' : ''}`} onClick={() => setTab('blid')}>📊 BLID Coverage</button>
      </div>

      {/* Content */}
      <div className="content">
        {state.activeTab === 'diagram'   && <FlowDiagram />}
        {state.activeTab === 'scenarios' && <ScenariosView />}
        {state.activeTab === 'blid'      && <BLIDDashboard />}
      </div>

      {showAddMod && activeFlow && (
        <AddModuleModal flowId={activeFlow.id} onClose={() => setShowAddMod(false)} />
      )}
    </main>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <div className="app-layout">
        <Sidebar />
        <MainPanel />
      </div>
    </AppProvider>
  );
}
