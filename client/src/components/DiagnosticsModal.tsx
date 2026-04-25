import type { Flow } from '../types';
import { parseImages } from './diagnosticsHelpers';

export interface DiagnosticIssue {
  severity: 'error' | 'warn' | 'info';
  module:   string;
  label:    string;
  message:  string;
}

export function runDiagnostics(flow: Flow): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // Track BLIDs across modules for duplicate check
  const blidMap = new Map<string, string[]>(); // blid → module labels

  for (const mod of flow.modules) {
    const loc = `${mod.label} — ${mod.name}`;

    // Module has no scenarios
    if (mod.scenarios.length === 0) {
      issues.push({ severity: 'warn', module: loc, label: 'No Scenarios', message: 'This module has no scenarios defined.' });
    }

    for (const sc of mod.scenarios) {
      const scLoc = `${loc} › ${sc.blid}`;

      // Track BLID
      if (sc.blid) {
        if (!blidMap.has(sc.blid)) blidMap.set(sc.blid, []);
        blidMap.get(sc.blid)!.push(mod.label);
      }

      // Scenario has no steps
      if (sc.steps.length === 0) {
        issues.push({ severity: 'error', module: loc, label: 'No Steps', message: `Scenario "${sc.description}" has no test steps.` });
        continue;
      }

      for (let i = 0; i < sc.steps.length; i++) {
        const step    = sc.steps[i];
        const stepLoc = `${scLoc} › Step ${i + 1}`;

        // Failed step with no issue type
        if (step.status === 'fail' && !step.issue_type) {
          issues.push({ severity: 'error', module: loc, label: 'Missing Issue Type', message: `${stepLoc}: Marked FAIL but no issue type (Blocker/Major/Minor) selected.` });
        }

        // Tested step with no date
        if ((step.status === 'pass' || step.status === 'fail') && !step.date_tested) {
          issues.push({ severity: 'warn', module: loc, label: 'Missing Date', message: `${stepLoc}: Marked ${step.status.toUpperCase()} but no date tested recorded.` });
        }

        // Failed step with no remarks
        if (step.status === 'fail' && !step.remarks?.trim()) {
          issues.push({ severity: 'warn', module: loc, label: 'Missing Remarks', message: `${stepLoc}: Marked FAIL but no remarks / actual result recorded.` });
        }

        // Failed step with no ADO ticket
        if (step.status === 'fail' && !step.ado_ticket?.trim()) {
          issues.push({ severity: 'warn', module: loc, label: 'Missing ADO Ticket', message: `${stepLoc}: Marked FAIL but no ADO ticket linked.` });
        }

        // Failed step with no evidence
        if (step.status === 'fail') {
          const hasEvidence = step.evidence_url?.trim() || parseImages(step.evidence_image).length > 0;
          if (!hasEvidence) {
            issues.push({ severity: 'warn', module: loc, label: 'Missing Evidence', message: `${stepLoc}: Marked FAIL but no screenshot or evidence URL attached.` });
          }
        }

        // Step with empty expected result
        if (!step.expected?.trim()) {
          issues.push({ severity: 'info', module: loc, label: 'Empty Expected Result', message: `${stepLoc}: Expected result is blank.` });
        }
      }
    }
  }

  // Duplicate BLIDs across modules
  for (const [blid, mods] of blidMap.entries()) {
    if (mods.length > 1) {
      issues.push({ severity: 'info', module: '(Cross-module)', label: 'Duplicate BLID', message: `BLID "${blid}" appears in multiple modules: ${mods.join(', ')}.` });
    }
  }

  return issues;
}

// ── Modal component ───────────────────────────────────────────────────────────
const SEV_META = {
  error: { icon: '✕', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Error' },
  warn:  { icon: '⚠', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'Warning' },
  info:  { icon: 'ℹ', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', label: 'Info' },
};

export function DiagnosticsModal({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const issues  = runDiagnostics(flow);
  const errors  = issues.filter(i => i.severity === 'error');
  const warns   = issues.filter(i => i.severity === 'warn');
  const infos   = issues.filter(i => i.severity === 'info');
  const clean   = issues.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>Full Diagnostics</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{flow.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)', lineHeight: 1 }}>×</button>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['error', 'warn', 'info'] as const).map(sev => {
            const count = issues.filter(i => i.severity === sev).length;
            const m = SEV_META[sev];
            return (
              <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: m.bg, border: `1px solid ${m.border}`, fontSize: 12, fontWeight: 600, color: m.color }}>
                <span>{m.icon}</span>
                <span>{count} {m.label}{count !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* All clear */}
        {clean && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✓</div>
            <div style={{ fontWeight: 700, color: '#15803d' }}>All Clear</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>No issues found. This flow is ready for reporting.</div>
          </div>
        )}

        {/* Issue list */}
        {!clean && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...errors, ...warns, ...infos].map((issue, idx) => {
              const m = SEV_META[issue.severity];
              return (
                <div key={idx} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: m.bg, border: `1px solid ${m.border}` }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{issue.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{issue.module}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>{issue.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{issues.length} issue{issues.length !== 1 ? 's' : ''} found</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
