import { useState } from 'react';
import { useApp } from '../AppContext';
import { useAuth } from '../AuthContext';
import { flowStats, modStats, modStatus, scenarioStatus, scenarioIssueType } from '../utils';
import { DiagnosticsModal } from './DiagnosticsModal';
import type { Flow } from '../types';

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7"/>
    </svg>
  );
}

function DoubleCheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 9l2.5 2.5 5-5M6.5 9l2.5 2.5 5-5"/>
    </svg>
  );
}

function AlertIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.3"/>
      <path d="M8 5v4M8 10.5v.7" strokeLinecap="round"/>
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 4h12M4 8h8M6 12h4"/>
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 4h10M3 8h7M3 12h4"/>
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <path d="M4 6l4 4 4-4"/>
    </svg>
  );
}

// ── Per-flow module rows helper ───────────────────────────────────────────────
function buildModRows(flow: Flow) {
  return flow.modules
    .map(mod => {
      const blids  = [...new Set(mod.scenarios.map(s => s.blid).filter(Boolean))];
      const passed = blids.filter(b => mod.scenarios.filter(s => s.blid === b).some(s => scenarioStatus(s) === 'pass'));
      const ms     = modStats(mod);
      const pct    = blids.length ? Math.round(passed.length / blids.length * 100) : 0;
      const status = modStatus(mod);
      return { mod, blids, passed, ms, pct, status };
    })
    .filter(r => r.blids.length > 0);
}

export function BLIDDashboard() {
  const { activeFlow, state } = useApp();
  const { user, isOwner } = useAuth();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [collapsedFlows, setCollapsedFlows] = useState<Set<string>>(new Set());

  if (!activeFlow) return null;

  const ownerName     = activeFlow.created_by_name;
  const isMyFlow      = isOwner(activeFlow.created_by);
  const viewingBanner = !isMyFlow && ownerName;

  const st  = flowStats(activeFlow);

  // ── Group flows ───────────────────────────────────────────────────────────
  const groupFlows = activeFlow.group_name
    ? state.flows.filter(f => f.group_name === activeFlow.group_name)
    : [activeFlow];
  const isGrouped = activeFlow.group_name && groupFlows.length > 1;

  // ── Group-level BLID coverage ─────────────────────────────────────────────
  const groupAll     = groupFlows.flatMap(f => f.modules.flatMap(m => m.scenarios));
  const groupBlids   = [...new Set(groupAll.map(s => s.blid).filter(Boolean))];
  const groupPassed  = groupBlids.filter(b => groupAll.filter(s => s.blid === b).some(s => scenarioStatus(s) === 'pass'));
  const groupBlidPct = groupBlids.length ? Math.round(groupPassed.length / groupBlids.length * 100) : 0;

  // ── Per-flow module rows ──────────────────────────────────────────────────
  const flowModRows = groupFlows.map(f => ({ flow: f, rows: buildModRows(f) })).filter(f => f.rows.length > 0);

  const toggleFlow = (id: string) => {
    setCollapsedFlows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Failing BLIDs (group-wide) ────────────────────────────────────────────
  const failMap = new Map<string, { blid: string; desc: string; issue: string | null; mod: string; flowName: string }>();
  for (const f of groupFlows) {
    const fAll = f.modules.flatMap(m => m.scenarios);
    for (const sc of fAll) {
      if (scenarioStatus(sc) === 'fail' && sc.blid && !failMap.has(sc.blid)) {
        const modLabel = f.modules.find(m => m.scenarios.includes(sc))?.label ?? '';
        failMap.set(sc.blid, { blid: sc.blid, desc: sc.description, issue: scenarioIssueType(sc), mod: modLabel, flowName: f.name });
      }
    }
  }
  const failingBLIDs = [...failMap.values()];

  const allPass = st.fail === 0 && st.pass > 0 && failingBLIDs.length === 0;

  const hasBlocker      = activeFlow.modules.some(m => modStatus(m) === 'blocked');
  const integrityStatus = hasBlocker ? 'fail' : st.fail === 0 && st.pass > 0 ? 'pass' : 'warn';
  const syncStatus      = st.total > 0 ? 'active' : 'warn';

  const coveragePct = isGrouped ? groupBlidPct : st.blidPct;

  const currentPct = st.execPct;
  const trendBars = [
    Math.max(5, currentPct - 65), Math.max(5, currentPct - 55),
    Math.max(5, currentPct - 42), Math.max(5, currentPct - 30),
    Math.max(5, currentPct - 18), Math.max(5, currentPct - 8),
    currentPct,
  ].map(v => Math.min(100, v));

  const kpis = [
    {
      label: isGrouped ? 'Group BLID Coverage' : 'URS Coverage',
      right: <span className="kpi-chip">{isGrouped ? activeFlow.group_name : 'Full'}</span>,
      value: <><span className="kpi-val">{coveragePct}<span className="kpi-val-unit">%</span></span></>,
      barPct: coveragePct,
      sub: null,
    },
    {
      label: 'Execution Progress',
      right: <span className="kpi-ico"><CheckIcon size={18} /></span>,
      value: <span className="kpi-val">{st.execPct}<span className="kpi-val-unit">%</span></span>,
      barPct: st.execPct,
      sub: null,
    },
    {
      label: 'Scenarios Passing',
      right: <span className="kpi-ico"><DoubleCheckIcon size={18} /></span>,
      value: <span className="kpi-val">{st.pass}<span className="kpi-val-denom">/{st.total}</span></span>,
      barPct: st.total ? Math.round(st.pass / st.total * 100) : 0,
      sub: null,
    },
    {
      label: 'Scenarios Failing',
      right: <span className="kpi-ico-muted"><AlertIcon size={18} /></span>,
      value: <span className={`kpi-val ${st.fail === 0 ? 'zero' : ''}`}>{st.fail}</span>,
      barPct: null,
      sub: <div className="kpi-sub"><span className="kpi-dot" style={st.fail > 0 ? { background: 'var(--bad)' } : {}} />{st.fail > 0 ? 'Needs attention' : 'Healthy State'}</div>,
    },
  ];

  const getStatusPill = (pct: number, status: string) => {
    if (status === 'blocked') return <span className="pill-fail">Blocked</span>;
    if (pct === 100) return <span className="pill-complete"><CheckIcon size={12} />Complete</span>;
    if (pct > 0)    return <span className="pill-progress">In Progress</span>;
    return <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>;
  };

  if (st.total === 0) {
    return (
      <div className="empty-state" style={{ marginTop: 24 }}>
        <div className="es-icon">📊</div>
        <div className="es-title">No scenarios yet</div>
        <div className="es-sub">Add scenarios to modules to see BLID coverage stats</div>
      </div>
    );
  }

  return (
    <div>
      {/* Ownership bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '9px 14px', borderRadius: 9,
        background: viewingBanner ? 'var(--hover)' : 'transparent',
        border: viewingBanner ? '1px solid var(--line)' : 'none',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: isMyFlow ? 'var(--blue-2)' : 'var(--ink-3)',
          display: 'grid', placeItems: 'center',
          color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0,
        }}>
          {ownerName ? ownerName[0].toUpperCase() : '?'}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            {isMyFlow ? 'Your BLID Coverage' : `${ownerName}'s BLID Coverage`}
          </span>
          {!isMyFlow && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
              color: 'var(--ink-3)', textTransform: 'uppercase',
              padding: '2px 6px', background: 'var(--line)', borderRadius: 4,
            }}>View only</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          {isGrouped ? activeFlow.group_name : activeFlow.name}
        </span>
      </div>

      {/* KPI row */}
      <div className="kpi-row">
        {kpis.map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-head">
              <div className="kpi-label">{k.label}</div>
              {k.right}
            </div>
            {k.value}
            {k.barPct !== null
              ? <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: `${k.barPct}%` }} /></div>
              : k.sub
            }
          </div>
        ))}
      </div>

      {/* Per-module BLID breakdown */}
      {flowModRows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="section-title-lg">
              Per-Module BLID Breakdown
              {isGrouped && (
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 8 }}>
                  {groupBlids.length} BLIDs · {groupPassed.length} passed · {groupBlidPct}% group coverage
                </span>
              )}
            </div>
            <div className="section-actions">
              <button className="btn-outline"><FilterIcon />Filter</button>
              <button className="btn-outline"><SortIcon />Sort</button>
            </div>
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th>Module</th>
                <th>Owner</th>
                <th>BLIDs</th>
                <th>Passed</th>
                <th>Coverage</th>
                <th>Scenarios</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {flowModRows.map(({ flow, rows }) => {
                const isActive    = flow.id === activeFlow.id;
                const isCollapsed = collapsedFlows.has(flow.id);
                const flowBlids   = [...new Set(rows.flatMap(r => r.blids))];
                const flowPassed  = flowBlids.filter(b => rows.some(r => r.blids.includes(b) && r.passed.includes(b)));
                const flowPct     = flowBlids.length ? Math.round(flowPassed.length / flowBlids.length * 100) : 0;

                return (
                  <>
                    {/* Flow sub-header row — only shown in group mode */}
                    {isGrouped && (
                      <tr
                        key={`hdr-${flow.id}`}
                        style={{ cursor: 'pointer', background: isActive ? 'rgba(29,78,216,.04)' : 'var(--hover)' }}
                        onClick={() => toggleFlow(flow.id)}
                      >
                        <td colSpan={5} style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ChevronIcon collapsed={isCollapsed} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? 'var(--blue-2)' : 'var(--ink)' }}>
                              {flow.name}
                            </span>
                            {isActive && (
                              <span style={{ fontSize: 10, background: 'var(--blue-soft)', color: 'var(--blue-2)', border: '1px solid var(--blue-line)', borderRadius: 99, padding: '1px 7px', fontWeight: 600 }}>
                                Active
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>
                          <span style={{ color: 'var(--ink-3)' }}>{flowBlids.length} BLIDs</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: flowPct === 100 ? 'var(--ok)' : flowPct > 50 ? 'var(--warn)' : 'var(--bad)' }}>
                            {flowPct}%
                          </span>
                        </td>
                      </tr>
                    )}

                    {/* Module rows */}
                    {!isCollapsed && rows.map(r => (
                      <tr key={r.mod.id} style={{ background: isGrouped && isActive ? 'rgba(29,78,216,.015)' : undefined }}>
                        <td>
                          <div className="tbl-mod-cell" style={{ paddingLeft: isGrouped ? 20 : 0 }}>
                            <span className="tbl-mod-main">{r.mod.label}: {r.mod.name}</span>
                            <span className="tbl-mod-sub">{r.mod.side} System</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: r.mod.created_by === user?.userId ? 'var(--blue-2)' : 'var(--ink-3)' }}>
                            {r.mod.created_by === user?.userId ? 'You' : (r.mod.created_by_name ?? '—')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {r.blids.map(b => (
                              <span key={b} className="blid-link" style={{ display: 'inline-block', width: 'fit-content' }}>{b}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.passed.length}</td>
                        <td>
                          <div className="cov-row">
                            <div className="cov-track">
                              <div className="cov-fill" style={{ width: `${r.pct}%` }} />
                            </div>
                            <span className="cov-pct">{r.pct}%</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>
                          <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{r.ms.pass}P</span>{' '}
                          <span style={{ color: 'var(--bad)', fontWeight: 600 }}>{r.ms.fail}F</span>{' '}
                          <span style={{ fontWeight: 500 }}>{r.ms.untested}U</span>
                        </td>
                        <td>{getStatusPill(r.pct, r.status)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Failing BLIDs */}
      {failingBLIDs.length > 0 && (
        <div className="section" style={{ borderColor: 'var(--bad-line)' }}>
          <div className="section-head">
            <div className="section-title-lg" style={{ color: 'var(--bad)' }}>Failing BLIDs</div>
          </div>
          <div>
            {failingBLIDs.map(fb => (
              <div key={fb.blid} className="fail-blid-row">
                <span className="blid">{fb.blid}</span>
                <span className="fb-mod">{fb.mod}</span>
                {isGrouped && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fb.flowName}</span>}
                <span className="fb-desc">{fb.desc}</span>
                {fb.issue && <span className={`fb-issue issue-${fb.issue}`}>{fb.issue}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success banner */}
      {allPass && !bannerDismissed && (
        <div className="banner">
          <div className="banner-ico"><CheckIcon size={16} /></div>
          <div className="banner-body">
            <div className="banner-title">Precision Target Reached</div>
            <div className="banner-sub">No failing BLIDs — great work! All traced requirements are currently passing active validation cycles.</div>
          </div>
          <button className="banner-dismiss" onClick={() => setBannerDismissed(true)}>Dismiss</button>
        </div>
      )}

      {/* Bottom row: trend + health */}
      <div className="bottom-row">
        <div className="trend">
          <div className="trend-title">Historical Coverage Trend</div>
          <div className="trend-chart">
            {trendBars.map((h, i) => (
              <div key={i} className={`trend-bar ${i >= 4 ? 'solid' : 'muted'}`} style={{ height: `${Math.max(4, h)}%` }} />
            ))}
          </div>
        </div>

        <div className="health">
          <div className="health-title">Health Metrics</div>
          <div className="health-sub">
            {allPass
              ? 'System reliability is peaking. All active modules are passing validation.'
              : hasBlocker
                ? 'A blocker issue is preventing downstream modules from executing.'
                : st.fail > 0
                  ? `${st.fail} scenario${st.fail > 1 ? 's' : ''} failing. Review and resolve to improve health.`
                  : 'Testing in progress. Continue executing scenarios to improve coverage.'}
          </div>
          <div className="health-row">
            <span className="hk">Integrity</span>
            <span className={`hv ${integrityStatus}`}>
              {integrityStatus === 'pass' ? 'PASS' : integrityStatus === 'fail' ? 'FAIL' : 'PARTIAL'}
            </span>
          </div>
          <div className="health-row">
            <span className="hk">Sync State</span>
            <span className={`hv ${syncStatus}`}>{syncStatus === 'active' ? 'ACTIVE' : 'IDLE'}</span>
          </div>
          <div className="health-row">
            <span className="hk">Coverage {isGrouped && <span style={{ fontSize: 9, opacity: .7, fontWeight: 400 }}>(group)</span>}</span>
            <span className={`hv ${coveragePct === 100 ? 'pass' : coveragePct > 50 ? 'warn' : 'fail'}`}>
              {coveragePct}%
            </span>
          </div>
          <button className="health-btn" onClick={() => setShowDiag(true)}>Full Diagnostics</button>
        </div>
      </div>

      {showDiag && <DiagnosticsModal flow={activeFlow} onClose={() => setShowDiag(false)} />}
    </div>
  );
}
