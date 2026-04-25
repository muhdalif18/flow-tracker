import * as XLSX from 'xlsx';
import type { Flow } from './types';
import { flowStats, modStatus, scenarioStatus, scenarioIssueType, STATUS_META, modStats } from './utils';

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
  } catch {}
  return [raw];
}

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  pass:     { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  fail:     { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  untested: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
};

const MOD_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  complete: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  blocked:  { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  major:    { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  minor:    { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  progress: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  pending:  { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  empty:    { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
};

export function exportReport(flow: Flow) {
  const stats    = flowStats(flow);
  const dateStr  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const execPct  = stats.total > 0 ? Math.round((stats.pass + stats.fail) / stats.total * 100) : 0;
  const passPct  = stats.total > 0 ? Math.round(stats.pass / stats.total * 100) : 0;

  const modulesHtml = flow.modules.map(mod => {
    const st  = modStatus(mod);
    const mc  = MOD_COLOR[st] ?? MOD_COLOR.pending;
    const sm  = STATUS_META[st];
    const sideColor = mod.side === 'eDS' ? '#1d4ed8' : '#7c3aed';

    const scenariosHtml = mod.scenarios.length === 0
      ? `<p style="color:#94a3b8;font-size:12px;margin:8px 0 0">No scenarios</p>`
      : mod.scenarios.map(sc => {
          const sst  = scenarioStatus(sc);
          const sit  = scenarioIssueType(sc);
          const sc_c = STATUS_COLOR[sst] ?? STATUS_COLOR.untested;

          const stepsHtml = sc.steps.map((step, si) => {
            const s_c   = STATUS_COLOR[step.status] ?? STATUS_COLOR.untested;
            const imgs  = parseImages(step.evidence_image);
            const label = step.status === 'pass' ? '✓ PASS' : step.status === 'fail' ? '✗ FAIL' : '— N/T';

            return `
            <tr style="border-top:1px solid #f1f5f9">
              <td style="padding:7px 10px;color:#64748b;font-size:11px;white-space:nowrap;vertical-align:top">Step ${si + 1}</td>
              <td style="padding:7px 10px;font-size:12px;vertical-align:top">${esc(step.description)}</td>
              <td style="padding:7px 10px;font-size:11px;color:#64748b;vertical-align:top">${esc(step.expected)}</td>
              <td style="padding:7px 10px;text-align:center;vertical-align:top">
                <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${s_c.bg};color:${s_c.color};border:1px solid ${s_c.border}">${label}</span>
              </td>
              <td style="padding:7px 10px;vertical-align:top">
                ${step.issue_type ? `<span style="font-size:10px;font-weight:600;color:${step.issue_type === 'blocker' ? '#dc2626' : '#d97706'}">${step.issue_type.toUpperCase()}</span>` : ''}
              </td>
              <td style="padding:7px 10px;font-size:11px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(step.date_tested)}</td>
              <td style="padding:7px 10px;font-size:11px;color:#64748b;vertical-align:top">
                ${step.ado_ticket ? `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:1px 6px;font-size:10px">${esc(step.ado_ticket)}</span>` : ''}
              </td>
              <td style="padding:7px 10px;vertical-align:top">
                ${step.evidence_url ? `<a href="${esc(step.evidence_url)}" style="font-size:10px;color:#1d4ed8">🔗 Link</a>` : ''}
              </td>
              <td style="padding:7px 10px;vertical-align:top">
                ${imgs.map(url => `<img src="${esc(url)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;margin-right:3px;cursor:pointer" onclick="window.open('${esc(url)}')" />`).join('')}
              </td>
            </tr>`;
          }).join('');

          return `
          <div style="margin-bottom:12px;border:1px solid ${sc_c.border};border-radius:8px;overflow:hidden">
            <div style="background:${sc_c.bg};padding:8px 12px;display:flex;align-items:center;gap:10px">
              <span style="font-family:monospace;font-size:11px;font-weight:700;background:#fff;border:1px solid ${sc_c.border};border-radius:4px;padding:2px 7px;color:${sc_c.color}">${esc(sc.blid)}</span>
              <span style="font-size:13px;font-weight:600;flex:1">${esc(sc.description)}</span>
              <span style="font-size:10px;font-weight:700;color:${sc_c.color}">${sst === 'pass' ? '✓ PASS' : sst === 'fail' ? '✗ FAIL' : '— N/T'}</span>
              ${sit ? `<span style="font-size:10px;font-weight:600;color:${sit === 'blocker' ? '#dc2626' : '#d97706'};margin-left:4px">${sit.toUpperCase()}</span>` : ''}
            </div>
            ${sc.steps.length > 0 ? `
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">STEP</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">DESCRIPTION</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">EXPECTED</th>
                  <th style="padding:5px 10px;text-align:center;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">STATUS</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">ISSUE</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">DATE</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">ADO</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">EVIDENCE</th>
                  <th style="padding:5px 10px;text-align:left;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.05em">SCREENSHOT</th>
                </tr>
              </thead>
              <tbody>${stepsHtml}</tbody>
            </table>` : `<p style="padding:8px 12px;font-size:12px;color:#94a3b8;margin:0">No steps</p>`}
          </div>`;
        }).join('');

    return `
    <div style="margin-bottom:24px;border:1px solid ${mc.border};border-radius:10px;overflow:hidden;page-break-inside:avoid">
      <div style="background:${mc.bg};padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid ${mc.border}">
        <span style="font-family:monospace;font-size:13px;font-weight:800;color:${sideColor}">${esc(mod.label)}</span>
        <span style="font-size:14px;font-weight:700;flex:1">${esc(mod.name)}</span>
        <span style="font-size:10px;font-weight:700;background:#fff;border:1px solid ${mc.border};border-radius:99px;padding:2px 10px;color:${mc.color}">${sm.label}</span>
        <span style="font-size:10px;font-weight:600;color:${sideColor};background:#fff;border:1px solid currentColor;border-radius:4px;padding:1px 6px;opacity:.8">${esc(mod.side)}</span>
      </div>
      <div style="padding:12px 16px">${scenariosHtml}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Test Report — ${esc(flow.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <div style="max-width:960px;margin:0 auto;padding:32px 24px">

    <!-- Print button -->
    <div class="no-print" style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button onclick="window.print()" style="padding:8px 18px;background:#1d4ed8;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600">🖨 Print / Save PDF</button>
    </div>

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:28px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px">TEST EXECUTION REPORT</div>
      <div style="font-size:26px;font-weight:800;margin-bottom:4px">${esc(flow.name)}</div>
      ${flow.description ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">${esc(flow.description)}</div>` : '<div style="margin-bottom:16px"></div>'}
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#4ade80">${stats.pass}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">PASS</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#f87171">${stats.fail}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">FAIL</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#94a3b8">${stats.untested}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">UNTESTED</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#60a5fa">${passPct}%</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">PASS RATE</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#c084fc">${stats.blidPct}%</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">BLID COVERAGE</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 18px;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#fbbf24">${execPct}%</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">EXECUTED</div>
        </div>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#64748b">Generated: ${dateStr} · ${flow.modules.length} modules · ${stats.total} scenarios</div>
    </div>

    <!-- Modules -->
    ${modulesHtml}

  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${flow.name.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateStr.replace(/ /g, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Excel export ──────────────────────────────────────────────────────────────
export function exportExcel(flow: Flow) {
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const stats   = flowStats(flow);
  const wb      = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ['FLOW TRACKER — TEST EXECUTION REPORT'],
    [],
    ['Flow',        flow.name],
    ['Description', flow.description || ''],
    ['Generated',   dateStr],
    [],
    ['OVERALL SUMMARY'],
    ['Total Scenarios', stats.total],
    ['Pass',            stats.pass],
    ['Fail',            stats.fail],
    ['Untested',        stats.untested],
    ['Pass Rate',       stats.total > 0 ? `${Math.round(stats.pass / stats.total * 100)}%` : '0%'],
    ['BLID Coverage',   `${stats.blidPct}%`],
    ['Execution',       `${stats.execPct}%`],
    [],
    ['MODULE BREAKDOWN'],
    ['Module ID', 'Module Name', 'Side', 'Status', 'Pass', 'Fail', 'Untested', 'Total', 'Note'],
    ...flow.modules.map(mod => {
      const ms = modStats(mod);
      const st = modStatus(mod);
      return [mod.label, mod.name, mod.side, STATUS_META[st].label.replace(/[^\w\s]/g, '').trim(), ms.pass, ms.fail, ms.untested, ms.total, mod.note || ''];
    }),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Scenarios ────────────────────────────────────────────────────
  const scHeaders = ['Module ID', 'Module Name', 'Side', 'Module Status', 'BLID', 'Scenario', 'Expected', 'Scenario Status'];
  const scRows: (string | number)[][] = [scHeaders];
  for (const mod of flow.modules) {
    const mst = STATUS_META[modStatus(mod)].label.replace(/[^\w\s]/g, '').trim();
    for (const sc of mod.scenarios) {
      const sst = scenarioStatus(sc);
      const sit = scenarioIssueType(sc);
      scRows.push([
        mod.label, mod.name, mod.side, mst,
        sc.blid, sc.description, '',
        sst === 'pass' ? 'PASS' : sst === 'fail' ? `FAIL${sit ? ' — ' + sit.toUpperCase() : ''}` : 'N/T',
      ]);
    }
    if (mod.scenarios.length === 0) {
      scRows.push([mod.label, mod.name, mod.side, mst, '', '(no scenarios)', '', '']);
    }
  }
  const wsScenarios = XLSX.utils.aoa_to_sheet(scRows);
  wsScenarios['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsScenarios, 'Scenarios');

  // ── Sheet 3: Steps ────────────────────────────────────────────────────────
  const stHeaders = ['Module ID', 'Module Name', 'BLID', 'Scenario', 'Step No', 'Step Description', 'Expected', 'Status', 'Issue Type', 'Date Tested', 'ADO Ticket', 'Evidence URL', 'Remarks'];
  const stRows: (string | number)[][] = [stHeaders];
  for (const mod of flow.modules) {
    for (const sc of mod.scenarios) {
      if (sc.steps.length === 0) {
        stRows.push([mod.label, mod.name, sc.blid, sc.description, '', '(no steps)', '', '', '', '', '', '', '']);
      } else {
        for (let i = 0; i < sc.steps.length; i++) {
          const step = sc.steps[i];
          stRows.push([
            mod.label, mod.name, sc.blid, sc.description,
            i + 1, step.description, step.expected,
            step.status === 'pass' ? 'PASS' : step.status === 'fail' ? 'FAIL' : 'N/T',
            step.issue_type?.toUpperCase() || '',
            step.date_tested || '', step.ado_ticket || '', step.evidence_url || '', step.remarks || '',
          ]);
        }
      }
    }
  }
  const wsSteps = XLSX.utils.aoa_to_sheet(stRows);
  wsSteps['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 32 }, { wch: 8 }, { wch: 36 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 32 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSteps, 'Steps');

  // ── Download ──────────────────────────────────────────────────────────────
  const filename = `${flow.name.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateStr.replace(/ /g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
