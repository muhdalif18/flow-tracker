import { useApp } from '../AppContext';
import { modStatus, modStats, isGated, getSlots } from '../utils';
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

// Layout constants
const NW     = 120;   // node width
const NH     = 66;    // node height
const H_GAP  = 80;    // horizontal gap between slots
const V_GAP  = 50;    // vertical gap between parallel modules
const PAD    = 50;    // horizontal padding

export function FlowDiagram() {
  const { activeFlow, setTab, setHighlightModule, setSearch } = useApp();
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

  const slots      = getSlots(modules);
  const SLOT_W     = NW + H_GAP;
  const maxPar     = Math.max(...slots.map(s => s.length));
  const groupH     = (n: number) => n * NH + (n - 1) * V_GAP;
  const SVG_H      = groupH(maxPar) + 120;
  const CY         = SVG_H / 2;
  const totalW     = slots.length * SLOT_W - H_GAP + PAD * 2;
  const svgW       = Math.max(totalW, 500);

  // Slot geometry helpers
  const slotX  = (i: number) => PAD + i * SLOT_W;
  const splitX = (i: number) => slotX(i) - H_GAP / 2;
  const joinX  = (i: number) => slotX(i) + NW + H_GAP / 2;
  const modY   = (groupSize: number, idx: number) =>
    CY - groupH(groupSize) / 2 + idx * (NH + V_GAP);

  return (
    <div className="diagram-card">
      <div style={{ overflowX: 'auto' }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${svgW} ${SVG_H}`}
          style={{ minWidth: totalW, width: '100%', display: 'block' }}
        >
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3z" fill="#cbd5e1" />
            </marker>
            <filter id="card-shadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* ── Pass 2: Inter-slot trunk connectors ──────────────────────── */}
          {slots.slice(0, -1).map((slot, si) => {
            const next   = slots[si + 1];
            const startX = slot.length > 1 ? joinX(si) : slotX(si) + NW;
            const endX   = next.length > 1 ? splitX(si + 1) : slotX(si + 1);
            const arrow  = next.length === 1;
            return (
              <line key={`trunk-${si}`}
                x1={startX} y1={CY}
                x2={endX - (arrow ? 3 : 0)} y2={CY}
                stroke="#cbd5e1" strokeWidth="1.5"
                markerEnd={arrow ? 'url(#ah)' : undefined}
              />
            );
          })}

          {/* ── Pass 3: Lead-out arrow ───────────────────────────────────── */}
          {(() => {
            const last  = slots[slots.length - 1];
            const startX = last.length > 1 ? joinX(slots.length - 1) : slotX(slots.length - 1) + NW;
            return (
              <line
                x1={startX} y1={CY} x2={startX + 20} y2={CY}
                stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#ah)"
              />
            );
          })()}

          {/* ── Pass 4: Parallel split/join paths ───────────────────────── */}
          {slots.map((slot, si) => {
            if (slot.length <= 1) return null;
            return (
              <g key={`par-${si}`}>
                <circle cx={splitX(si)} cy={CY} r={5} fill="#94a3b8" />
                <circle cx={joinX(si)}  cy={CY} r={5} fill="#94a3b8" />
                {slot.map((mod, mi) => {
                  const mcy = modY(slot.length, mi) + NH / 2;
                  return (
                    <g key={mod.id}>
                      {/* Split → module */}
                      <path
                        d={`M${splitX(si)},${CY} L${splitX(si)},${mcy} L${slotX(si)},${mcy}`}
                        stroke="#cbd5e1" strokeWidth="1.5" fill="none"
                        markerEnd="url(#ah)"
                      />
                      {/* Module → join */}
                      <path
                        d={`M${slotX(si) + NW},${mcy} L${joinX(si)},${mcy} L${joinX(si)},${CY}`}
                        stroke="#cbd5e1" strokeWidth="1.5" fill="none"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* ── Pass 5: Module nodes ─────────────────────────────────────── */}
          {slots.map((slot, si) =>
            slot.map((mod: Module, mi: number) => {
              const isParallel = slot.length > 1;
              const x   = slotX(si);
              const y   = isParallel ? modY(slot.length, mi) : CY - NH / 2;
              const cx  = x + NW / 2;
              const modIdx = modules.indexOf(mod);
              const st  = modStatus(mod);
              const gated = isGated(activeFlow, modIdx);
              const c   = STATUS_COLORS[st] ?? STATUS_COLORS.pending;
              const ms  = modStats(mod);
              const sideColor = mod.side === 'eDS' ? '#3b82f6' : '#7c3aed';
              const [l1, l2]  = wrapName(mod.name);

              return (
                <g key={mod.id}>
                  {/* Gate outline */}
                  {gated && (
                    <rect x={x - 2} y={y - 2} width={NW + 4} height={NH + 4} rx="10"
                      fill="#dc2626" fillOpacity="0.05"
                      stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5 3" />
                  )}

                  {/* Shadow */}
                  <rect x={x} y={y + 1} width={NW} height={NH} rx="9" fill="rgba(0,0,0,.06)" />

                  {/* Node */}
                  <rect x={x} y={y} width={NW} height={NH} rx="9"
                    fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />

                  {/* Side stripe */}
                  <rect x={x} y={y} width={4} height={NH} rx="2" fill={sideColor} opacity="0.75" />

                  {/* Label */}
                  <text x={cx + 1} y={y + 20} textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="700" fill={c.stroke}>
                    {mod.label}
                  </text>

                  {/* Name line 1 */}
                  <text x={cx + 2} y={y + 34} textAnchor="middle"
                    fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8.5" fill={c.text}>
                    {l1}
                  </text>
                  {l2 && (
                    <text x={cx + 2} y={y + 45} textAnchor="middle"
                      fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8.5" fill={c.text}>
                      {l2}
                    </text>
                  )}

                  {/* Side label */}
                  <text x={cx} y={y + NH - 8} textAnchor="middle"
                    fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8" fontWeight="700"
                    fill={sideColor} opacity="0.85">
                    {mod.side}
                  </text>

                  {/* Blocker icon */}
                  {st === 'blocked' && (
                    <text x={x + NW - 6} y={y + 16} textAnchor="end" fontSize="12">🔒</text>
                  )}

                  {/* Note */}
                  {mod.note && (
                    <text x={cx} y={y + NH + 14} textAnchor="middle"
                      fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="8"
                      fill="#7c3aed" fontStyle="italic">
                      {mod.note}
                    </text>
                  )}

                  {/* Stats */}
                  <text x={cx} y={y + NH + (mod.note ? 27 : 14)} textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#94a3b8">
                    {ms.pass}P · {ms.fail}F · {ms.untested}U
                  </text>

                  {/* Clickable overlay */}
                  <rect x={x} y={y} width={NW} height={NH} rx="9" fill="transparent"
                    style={{ cursor: 'pointer' }} onClick={() => {
                      setSearch('');
                      setHighlightModule(mod.id);
                      setTab('scenarios');
                    }} />
                </g>
              );
            })
          )}

          {/* ── Legend ───────────────────────────────────────────────────── */}
          {[
            { color: '#059669', label: 'Complete'    },
            { color: '#dc2626', label: 'Blocked'     },
            { color: '#d97706', label: 'Has Issue'   },
            { color: '#3b82f6', label: 'In Progress' },
            { color: '#94a3b8', label: 'Not Started' },
          ].map((li, i) => (
            <g key={li.label}>
              <circle cx={22 + i * 110 + 4} cy={SVG_H - 9} r={4} fill={li.color} />
              <text x={22 + i * 110 + 12} y={SVG_H - 5}
                fontFamily="Plus Jakarta Sans, Segoe UI, sans-serif" fontSize="9" fill="#94a3b8">
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
