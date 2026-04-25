import { useApp } from '../AppContext';
import { modStatus, modStats, isGated } from '../utils';
import type { Module } from '../types';

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  complete: { fill: '#d1fae5', stroke: '#059669', text: '#065f46' },
  blocked:  { fill: '#fee2e2', stroke: '#dc2626', text: '#991b1b' },
  major:    { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' },
  minor:    { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' },
  progress: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af' },
  pending:  { fill: '#f1f5f9', stroke: '#94a3b8', text: '#64748b' },
  empty:    { fill: '#f8fafc', stroke: '#e2e8f0', text: '#94a3b8' },
};

function wrapName(name: string): [string, string] {
  const words = name.split(' ');
  const half  = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

export function FlowDiagram() {
  const { activeFlow, setTab } = useApp();

  if (!activeFlow) return null;

  const { modules } = activeFlow;

  if (!modules.length) {
    return (
      <div className="empty-state">
        <div className="es-icon">🔀</div>
        <div className="es-title">No modules yet</div>
        <div className="es-sub">Add modules to build the flow diagram</div>
      </div>
    );
  }

  const NW = 118, NH = 64, GAP = 22, PAD = 16;
  const totalW = modules.length * (NW + GAP) - GAP + PAD * 2;
  const svgW   = Math.max(totalW, 500);
  const H = 195;

  return (
    <div className="diagram-card">
      <div style={{ overflowX: 'auto' }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${svgW} ${H}`}
          style={{ minWidth: totalW, width: '100%', display: 'block' }}
        >
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3z" fill="#94a3b8" />
            </marker>
          </defs>

          {modules.map((mod: Module, i: number) => {
            const x  = PAD + i * (NW + GAP);
            const y  = 40;
            const cx = x + NW / 2;
            const cy = y + NH / 2;
            const st = modStatus(mod);
            const gated = isGated(activeFlow, i);
            const c  = STATUS_COLORS[st] ?? STATUS_COLORS.pending;
            const ms = modStats(mod);
            const sideColor = mod.side === 'eDS' ? '#3b82f6' : '#7c3aed';
            const [l1, l2] = wrapName(mod.name);

            return (
              <g key={mod.id}>
                {/* Arrow from previous */}
                {i > 0 && (
                  <line
                    x1={PAD + (i - 1) * (NW + GAP) + NW} y1={cy}
                    x2={x - 3} y2={cy}
                    stroke="#cbd5e1" strokeWidth="1.5"
                    markerEnd="url(#ah)"
                  />
                )}

                {/* Gate dashed outline */}
                {gated && (
                  <rect x={x} y={y} width={NW} height={NH} rx="8"
                    fill="#dc2626" fillOpacity="0.06"
                    stroke="#dc2626" strokeWidth="1" strokeDasharray="4" />
                )}

                {/* Node background */}
                <rect x={x} y={y} width={NW} height={NH} rx="8" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />

                {/* Side stripe */}
                <rect x={x} y={y} width={4} height={NH} rx="2" fill={sideColor} opacity="0.7" />

                {/* Module label */}
                <text x={cx} y={y + 19} textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="600" fill={c.stroke}>
                  {mod.label}
                </text>

                {/* Name lines */}
                <text x={cx + 2} y={y + 33} textAnchor="middle"
                  fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8.5" fill={c.text}>
                  {l1}
                </text>
                {l2 && (
                  <text x={cx + 2} y={y + 44} textAnchor="middle"
                    fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8.5" fill={c.text}>
                    {l2}
                  </text>
                )}

                {/* Side label */}
                <text x={cx} y={y + NH - 10} textAnchor="middle"
                  fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8" fontWeight="600" fill={sideColor}>
                  {mod.side}
                </text>

                {/* Blocker icon */}
                {st === 'blocked' && (
                  <text x={x + NW - 6} y={y + 15} textAnchor="end" fontSize="11">🔒</text>
                )}

                {/* Note label */}
                {mod.note && (
                  <text x={cx} y={y + NH + 24} textAnchor="middle"
                    fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8" fill="#7c3aed" fontStyle="italic">
                    {mod.note}
                  </text>
                )}

                {/* Stats */}
                <text x={cx} y={y + NH + (mod.note ? 38 : 16)} textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#64748b">
                  {ms.pass}P·{ms.fail}F·{ms.untested}U
                </text>

                {/* Clickable overlay */}
                <rect x={x} y={y} width={NW} height={NH} rx="8" fill="transparent"
                  style={{ cursor: 'pointer' }} onClick={() => setTab('scenarios')} />
              </g>
            );
          })}

          {/* Legend */}
          {[
            { color: '#059669', label: 'Complete' },
            { color: '#dc2626', label: 'Blocked'  },
            { color: '#d97706', label: 'Has Issue' },
            { color: '#3b82f6', label: 'In Progress' },
            { color: '#94a3b8', label: 'Not Started' },
          ].map((li, i) => (
            <g key={li.label}>
              <circle cx={20 + i * 110 + 4} cy={H - 9} r={4} fill={li.color} />
              <text x={20 + i * 110 + 12} y={H - 5}
                fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="9" fill="#64748b">
                {li.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="diagram-hint">Click any module node to jump to Test Scenarios</p>
    </div>
  );
}
