import { useState } from 'react';
import { useApp } from '../AppContext';
import { modStatus, modStats, scenarioStatus, scenarioIssueType, flowStats, STATUS_META } from '../utils';
import type { Flow, Module, ModuleStatus } from '../types';
import { getFlag } from '../featureFlags';

// ── Helpers ───────────────────────────────────────────────────────────────

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function lastTested(flows: Flow[]): string {
  let latest = '';
  for (const flow of flows)
    for (const mod of flow.modules)
      for (const sc of mod.scenarios)
        for (const step of sc.steps)
          if (step.date_tested && step.date_tested > latest) latest = step.date_tested;
  if (!latest) return 'Never';
  if (latest.startsWith(isoToday())) return 'Today';
  return latest;
}

interface AggStats {
  pass: number; fail: number; untested: number; total: number;
  blockers: number; majors: number; minors: number;
  blidTotal: number; blidPass: number; blidPct: number;
  totalMods: number; completeMods: number; totalScenarios: number;
  execPct: number; passPct: number;
}

function aggregate(flows: Flow[]): AggStats {
  let pass = 0, fail = 0, untested = 0, blockers = 0, majors = 0, minors = 0;
  let blidTotal = 0, blidPass = 0, totalMods = 0, completeMods = 0, totalScenarios = 0;

  for (const flow of flows) {
    const s = flowStats(flow);
    pass += s.pass; fail += s.fail; untested += s.untested;
    blidTotal += s.blidTotal; blidPass += s.blidPass;
    totalMods += flow.modules.length;
    completeMods += flow.modules.filter(m => modStatus(m) === 'complete').length;
    totalScenarios += flow.modules.reduce((n, m) => n + m.scenarios.length, 0);
    for (const mod of flow.modules)
      for (const sc of mod.scenarios)
        for (const step of sc.steps) {
          if (step.issue_type === 'blocker') blockers++;
          else if (step.issue_type === 'major') majors++;
          else if (step.issue_type === 'minor') minors++;
        }
  }

  const total = pass + fail + untested;
  const execPct = total > 0 ? Math.round((pass + fail) / total * 100) : 0;
  const passPct = total > 0 ? Math.round(pass / total * 100) : 0;
  const blidPct = blidTotal > 0 ? Math.round(blidPass / blidTotal * 100) : 0;
  return { pass, fail, untested, total, blockers, majors, minors, blidTotal, blidPass, blidPct, totalMods, completeMods, totalScenarios, execPct, passPct };
}

const SIDE_COLOR: Record<string, string> = { eDS: '#1d4ed8', HITS: '#7c3aed' };
const SIDE_BG:    Record<string, string> = { eDS: '#eff6ff', HITS: '#f5f3ff' };

// ── Main component ────────────────────────────────────────────────────────

export default function OverviewDashboard() {
  const { activeFlow, state, setTab, setHighlightModule, setActive } = useApp();
  const [groupMode, setGroupMode]   = useState(false);
  const [expandedMods, setExpandedMods] = useState<Set<string>>(new Set());

  if (!activeFlow) return null;

  const groupOverviewEnabled = getFlag('ft_group_overview');

  const groupName = activeFlow.group_name?.trim();
  const groupFlows = groupName
    ? state.flows.filter(f => f.group_name?.trim() === groupName)
    : [activeFlow];
  const hasGroup = groupOverviewEnabled && groupFlows.length > 1;

  const viewFlows = groupMode && hasGroup ? groupFlows : [activeFlow];
  const agg = aggregate(viewFlows);

  const toggleMod = (id: string) =>
    setExpandedMods(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Attention modules (blocked or major) across viewed flows
  const attnItems: { flow: Flow; mod: Module }[] = [];
  for (const flow of viewFlows)
    for (const mod of flow.modules) {
      const st = modStatus(mod);
      if (st === 'blocked' || st === 'major') attnItems.push({ flow, mod });
    }

  return (
    <div className="ov-root">

      {/* ── Scope toggle ────────────────────────────────────────────── */}
      {hasGroup && (
        <div className="ov-scope-bar">
          <button
            className={`ov-scope-btn ${!groupMode ? 'active' : ''}`}
            onClick={() => setGroupMode(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
            </svg>
            This Flow
            <span className="ov-scope-name">{activeFlow.name}</span>
          </button>
          <button
            className={`ov-scope-btn ${groupMode ? 'active' : ''}`}
            onClick={() => setGroupMode(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            Group
            <span className="ov-scope-name">{groupName}</span>
            <span className="ov-scope-count">{groupFlows.length} flows</span>
          </button>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────── */}
      <div className="ov-kpi-row">
        <KpiCard label="Modules"    value={agg.totalMods}        sub={`${agg.completeMods} complete`}              color="var(--blue-2)" />
        <KpiCard label="Scenarios"  value={agg.totalScenarios}   sub={`${agg.total} steps`}                        color="var(--blue-2)" />
        <KpiCard label="Pass"       value={agg.pass}             sub={`${agg.passPct}% pass rate`}                 color="#16a34a" />
        <KpiCard label="Fail"       value={agg.fail}             sub={`${agg.blockers}B · ${agg.majors}M · ${agg.minors}m`} color="#dc2626" />
        <KpiCard label="Untested"   value={agg.untested}         sub={`${agg.execPct}% executed`}                  color="#94a3b8" />
        <KpiCard label="BLID Cov."  value={`${agg.blidPct}%`}   sub={`${agg.blidPass}/${agg.blidTotal} BLIDs`}   color="#7c3aed" />
        <KpiCard label="Last Tested" value={lastTested(viewFlows)} sub="date tested"                               color="var(--ink-3)" small />
      </div>

      <div className="ov-body">
        {/* ── Progress bars ─────────────────────────────────────────── */}
        <div className="ov-card ov-progress-card">
          <div className="ov-card-title">Execution Progress</div>
          <ProgressBar label="Executed"      pct={agg.execPct}  color="var(--blue-2)" />
          <ProgressBar label="Pass Rate"     pct={agg.passPct}  color="#16a34a" />
          <ProgressBar label="BLID Coverage" pct={agg.blidPct}  color="#7c3aed" />
        </div>

        {/* ── Issue summary ─────────────────────────────────────────── */}
        <div className="ov-card ov-issues-card">
          <div className="ov-card-title">Issue Summary</div>
          <IssueRow color="#dc2626" label="Blocker" count={agg.blockers} />
          <IssueRow color="#d97706" label="Major"   count={agg.majors} />
          <IssueRow color="#f59e0b" label="Minor"   count={agg.minors} />
          {agg.blockers === 0 && agg.majors === 0 && agg.minors === 0 && (
            <div className="ov-no-issues">No issues found</div>
          )}
        </div>
      </div>

      {/* ── Group: per-flow progress ───────────────────────────────── */}
      {groupMode && hasGroup && (
        <div className="ov-card" style={{ marginBottom: 20 }}>
          <div className="ov-card-title">Per-Flow Progress</div>
          {groupFlows.map(flow => {
            const s = flowStats(flow);
            const execP = s.total > 0 ? Math.round((s.pass + s.fail) / s.total * 100) : 0;
            const passP = s.total > 0 ? Math.round(s.pass / s.total * 100) : 0;
            const isActive = flow.id === activeFlow.id;
            return (
              <div key={flow.id} className={`ov-flow-row ${isActive ? 'ov-flow-row--active' : ''}`}>
                <div className="ov-flow-row-left">
                  <button
                    className="ov-flow-name-btn"
                    onClick={() => { setActive(flow.id); setGroupMode(false); }}
                    title="Switch to this flow"
                  >
                    {flow.name}
                    {isActive && <span className="ov-flow-active-tag">current</span>}
                  </button>
                  <span className="ov-flow-meta">{flow.modules.length} modules · {s.total} steps</span>
                </div>
                <div className="ov-flow-row-right">
                  <div className="ov-flow-mini-stats">
                    <span style={{ color: '#16a34a' }}>{s.pass}P</span>
                    <span style={{ color: '#dc2626' }}>{s.fail}F</span>
                    <span style={{ color: '#94a3b8' }}>{s.untested}NT</span>
                  </div>
                  <div className="ov-flow-pbar-wrap">
                    <div className="ov-pbar-track">
                      <div className="ov-pbar-fill" style={{ width: `${passP}%`, background: '#16a34a' }} />
                      <div className="ov-pbar-fill" style={{ width: `${execP - passP}%`, background: '#dc2626' }} />
                    </div>
                    <span className="ov-pbar-pct" style={{ color: 'var(--blue-2)' }}>{execP}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#7c3aed', fontFamily: 'var(--mono)', fontWeight: 700 }}>{s.blidPct}% BLID</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Needs attention ───────────────────────────────────────── */}
      {attnItems.length > 0 && (
        <div className="ov-card" style={{ marginBottom: 20 }}>
          <div className="ov-card-title" style={{ color: '#dc2626' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Needs Attention ({attnItems.length})
          </div>
          {attnItems.map(({ flow, mod }) => {
            const st = modStatus(mod);
            const ms = modStats(mod);
            const sc = SIDE_COLOR[mod.side] ?? '#1d4ed8';
            return (
              <div key={mod.id} className="ov-attn-row">
                {groupMode && (
                  <span className="ov-attn-flow">{flow.name}</span>
                )}
                <span className="ov-attn-label" style={{ color: sc, background: SIDE_BG[mod.side] }}>{mod.label}</span>
                <span className="ov-attn-name">{mod.name}</span>
                <span className={`st-badge st-${st}`}>{STATUS_META[st].label}</span>
                <span className="ov-attn-stats">
                  <span style={{ color: '#16a34a' }}>{ms.pass}P</span>
                  <span style={{ color: '#dc2626' }}>{ms.fail}F</span>
                  <span style={{ color: '#94a3b8' }}>{ms.untested}NT</span>
                </span>
                <button
                  className="ov-goto-btn"
                  onClick={() => {
                    if (flow.id !== activeFlow.id) setActive(flow.id);
                    setHighlightModule(mod.id);
                    setTab('scenarios');
                  }}
                >
                  View →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Module breakdown table ─────────────────────────────────── */}
      <div className="ov-card">
        <div className="ov-card-title">Module Breakdown</div>
        <table className="ov-table">
          <thead>
            <tr>
              {groupMode && <th>Flow</th>}
              <th>ID</th>
              <th>Module</th>
              <th>Side</th>
              <th>Scenarios</th>
              <th style={{ textAlign: 'center' }}>Pass</th>
              <th style={{ textAlign: 'center' }}>Fail</th>
              <th style={{ textAlign: 'center' }}>N/T</th>
              <th>Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {viewFlows.map(flow =>
              flow.modules.map(mod => {
                const st = modStatus(mod);
                const ms = modStats(mod);
                const pct      = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;
                const barPass  = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;
                const barFail  = ms.total > 0 ? Math.round(ms.fail / ms.total * 100) : 0;
                const sideC    = SIDE_COLOR[mod.side] ?? '#1d4ed8';
                const isExp    = expandedMods.has(mod.id);
                const rowKey   = `${flow.id}-${mod.id}`;

                return (
                  <ModuleRows
                    key={rowKey}
                    mod={mod}
                    flow={flow}
                    st={st}
                    ms={ms}
                    pct={pct}
                    barPass={barPass}
                    barFail={barFail}
                    sideC={sideC}
                    isExp={isExp}
                    showFlow={groupMode}
                    isActiveFlow={flow.id === activeFlow.id}
                    onToggle={() => toggleMod(mod.id)}
                    onView={() => {
                      if (flow.id !== activeFlow.id) setActive(flow.id);
                      setHighlightModule(mod.id);
                      setTab('scenarios');
                    }}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ModuleRows (extracted to avoid key warning on fragment) ───────────────

function ModuleRows({ mod, flow, st, ms, pct, barPass, barFail, sideC, isExp, showFlow, isActiveFlow, onToggle, onView }: {
  mod: Module;
  flow: Flow;
  st: ModuleStatus; ms: { pass: number; fail: number; untested: number; total: number };
  pct: number; barPass: number; barFail: number; sideC: string;
  isExp: boolean; showFlow: boolean; isActiveFlow: boolean;
  onToggle: () => void; onView: () => void;
}) {
  return (
    <>
      <tr className={`ov-tr ${isExp ? 'ov-tr-open' : ''}`} onClick={onToggle} style={{ cursor: 'pointer' }}>
        {showFlow && (
          <td style={{ fontSize: 11, color: isActiveFlow ? 'var(--blue-2)' : 'var(--ink-3)', fontWeight: isActiveFlow ? 700 : 400, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {flow.name}
          </td>
        )}
        <td>
          <span className="ov-mod-label" style={{ color: sideC, background: SIDE_BG[mod.side] }}>{mod.label}</span>
        </td>
        <td className="ov-mod-name">
          <span>{mod.name}</span>
          {mod.note && <span className="ov-mod-note">{mod.note}</span>}
        </td>
        <td>
          <span className="ov-side-tag" style={{ color: sideC, background: SIDE_BG[mod.side] }}>{mod.side}</span>
        </td>
        <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{mod.scenarios.length}</td>
        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600, fontSize: 12 }}>{ms.pass}</td>
        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 600, fontSize: 12 }}>{ms.fail}</td>
        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{ms.untested}</td>
        <td style={{ minWidth: 110 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 99, background: '#f1f5f9', display: 'flex', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barPass}%`, background: '#16a34a' }} />
              <div style={{ height: '100%', width: `${barFail}%`, background: '#dc2626' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-2)', whiteSpace: 'nowrap' }}>{pct}%</span>
          </div>
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`st-badge st-${st}`}>{STATUS_META[st].label}</span>
            <button
              className="ov-goto-btn"
              onClick={e => { e.stopPropagation(); onView(); }}
            >
              View
            </button>
          </div>
        </td>
      </tr>
      {isExp && mod.scenarios.map(sc2 => {
        const sst = scenarioStatus(sc2);
        const sit = scenarioIssueType(sc2);
        return (
          <tr key={sc2.id} className="ov-sc-row">
            {showFlow && <td />}
            <td />
            <td colSpan={2}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 12 }}>
                <span className="blid">{sc2.blid}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{sc2.description}</span>
                {sit && <span className={`sc-issue ${sit}`}>{sit.toUpperCase()}</span>}
              </div>
            </td>
            <td style={{ fontSize: 11, color: 'var(--ink-3)' }}>{sc2.steps.length} steps</td>
            <td style={{ textAlign: 'center', fontSize: 11, color: '#16a34a' }}>{sc2.steps.filter(s => s.status === 'pass').length}</td>
            <td style={{ textAlign: 'center', fontSize: 11, color: '#dc2626' }}>{sc2.steps.filter(s => s.status === 'fail').length}</td>
            <td style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>{sc2.steps.filter(s => s.status === 'untested').length}</td>
            <td />
            <td>
              <span className={`sst-pill ${sst === 'pass' ? 'sst-pill-pass' : sst === 'fail' ? 'sst-pill-fail' : 'sst-pill-nt'}`} style={{ fontSize: 10, padding: '2px 7px' }}>
                {sst === 'pass' ? '✓ PASS' : sst === 'fail' ? '✗ FAIL' : 'N/T'}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, small }: { label: string; value: string | number; sub: string; color: string; small?: boolean }) {
  return (
    <div className="ov-kpi">
      <div className="ov-kpi-value" style={{ color, fontSize: small ? 15 : undefined }}>{value}</div>
      <div className="ov-kpi-label">{label}</div>
      <div className="ov-kpi-sub">{sub}</div>
    </div>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="ov-pbar-row">
      <span className="ov-pbar-label">{label}</span>
      <div className="ov-pbar-track">
        <div className="ov-pbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ov-pbar-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}

function IssueRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="ov-issue-row">
      <span className="ov-issue-dot" style={{ background: color }} />
      <span className="ov-issue-label">{label}</span>
      <span className="ov-issue-count" style={{ color }}>{count}</span>
    </div>
  );
}
