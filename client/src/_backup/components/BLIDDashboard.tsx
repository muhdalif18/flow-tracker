import { useApp } from '../AppContext';
import { flowStats, modStats, modStatus } from '../utils';

export function BLIDDashboard() {
  const { activeFlow } = useApp();
  if (!activeFlow) return null;

  const st  = flowStats(activeFlow);
  const all = activeFlow.modules.flatMap(m => m.scenarios);

  const modRows = activeFlow.modules
    .map(mod => {
      const blids   = [...new Set(mod.scenarios.map(s => s.blid).filter(Boolean))];
      const passed  = blids.filter(b => mod.scenarios.filter(s => s.blid === b).some(s => s.status === 'pass'));
      const ms      = modStats(mod);
      const pct     = blids.length ? Math.round(passed.length / blids.length * 100) : 0;
      return { mod, blids, passed, ms, pct };
    })
    .filter(r => r.blids.length > 0);

  // Unique failing BLIDs
  const failMap = new Map<string, { blid: string; desc: string; issue: string | null; mod: string }>();
  for (const sc of all) {
    if (sc.status === 'fail' && sc.blid && !failMap.has(sc.blid)) {
      const modLabel = activeFlow.modules.find(m => m.scenarios.includes(sc))?.label ?? '';
      failMap.set(sc.blid, { blid: sc.blid, desc: sc.description, issue: sc.issue_type, mod: modLabel });
    }
  }
  const failingBLIDs = [...failMap.values()];

  return (
    <div>
      {/* Stat cards */}
      <div className="blid-grid">
        <div className="blid-card">
          <div className="bc-label">URS Coverage</div>
          <div className="bc-val">{st.blidPct}<span className="bc-unit">%</span></div>
          <div className="bc-sub">{st.blidPass} / {st.blidTotal} BLIDs passed</div>
          <div className="bc-bar"><div className="bc-fill" style={{ width: `${st.blidPct}%`, background: '#059669' }} /></div>
        </div>
        <div className="blid-card">
          <div className="bc-label">Execution Progress</div>
          <div className="bc-val">{st.execPct}<span className="bc-unit">%</span></div>
          <div className="bc-sub">{st.total - st.untested} / {st.total} scenarios tested</div>
          <div className="bc-bar"><div className="bc-fill" style={{ width: `${st.execPct}%`, background: '#3b82f6' }} /></div>
        </div>
        <div className="blid-card">
          <div className="bc-label">Scenarios Passing</div>
          <div className="bc-val" style={{ color: '#059669' }}>{st.pass}</div>
          <div className="bc-sub">out of {st.total} total</div>
        </div>
        <div className="blid-card">
          <div className="bc-label">Scenarios Failing</div>
          <div className="bc-val" style={{ color: st.fail > 0 ? '#dc2626' : '#059669' }}>{st.fail}</div>
          <div className="bc-sub">{st.fail > 0 ? 'Needs attention' : 'None — clean!'}</div>
        </div>
      </div>

      {/* Per-module breakdown */}
      {modRows.length > 0 && (
        <>
          <div className="section-title">Per-module BLID breakdown</div>
          <div className="blid-table-wrap">
            <table className="blid-tbl">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>BLIDs</th>
                  <th>Passed</th>
                  <th>Coverage</th>
                  <th>Scenarios</th>
                </tr>
              </thead>
              <tbody>
                {modRows.map(r => (
                  <tr key={r.mod.id}>
                    <td>
                      <span className="blid">{r.mod.label}</span>{' '}
                      <span className="td-name">{r.mod.name}</span>
                    </td>
                    <td className="td-mono">{r.blids.join(', ')}</td>
                    <td>{r.passed.length} / {r.blids.length}</td>
                    <td>
                      <div className="pct-row">
                        <div className="pct-track">
                          <div className="pct-fill" style={{ width: `${r.pct}%`, background: r.pct === 100 ? '#059669' : '#3b82f6' }} />
                        </div>
                        <span className="pct-text" style={{ color: r.pct === 100 ? '#059669' : '#64748b', fontWeight: r.pct === 100 ? 600 : 400 }}>
                          {r.pct}%
                        </span>
                      </div>
                    </td>
                    <td className="td-counts">
                      <span style={{ color: '#059669' }}>{r.ms.pass}P</span>{' '}
                      <span style={{ color: '#dc2626' }}>{r.ms.fail}F</span>{' '}
                      <span style={{ color: '#d97706' }}>{r.ms.untested}U</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Failing BLIDs */}
      {failingBLIDs.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>Failing BLIDs</div>
          <div className="fail-blid-list">
            {failingBLIDs.map(fb => (
              <div key={fb.blid} className="fail-blid-row">
                <span className="blid">{fb.blid}</span>
                <span className="fb-mod">{fb.mod}</span>
                <span className="fb-desc">{fb.desc}</span>
                {fb.issue && <span className={`fb-issue issue-${fb.issue}`}>{fb.issue}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {st.fail === 0 && st.pass > 0 && failingBLIDs.length === 0 && (
        <div className="all-pass-msg">✓ No failing BLIDs — great work!</div>
      )}

      {st.total === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="es-title">No scenarios yet</div>
          <div className="es-sub">Add scenarios to modules to see BLID coverage stats</div>
        </div>
      )}
    </div>
  );
}
