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
  const stats   = flowStats(flow);
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalScenarios = flow.modules.reduce((n, m) => n + m.scenarios.length, 0);
  const execPct = stats.total > 0 ? Math.round((stats.pass + stats.fail) / stats.total * 100) : 0;
  const passPct = stats.total > 0 ? Math.round(stats.pass / stats.total * 100) : 0;

  const SIDE_COLOR: Record<string, string> = { eDS: '#1d4ed8', HITS: '#7c3aed' };
  const SIDE_BG:    Record<string, string> = { eDS: '#eff6ff', HITS: '#f5f3ff' };

  const MOD_LEFT: Record<string, string> = {
    complete: '#16a34a', blocked: '#dc2626', major: '#d97706',
    minor: '#f59e0b', progress: '#3b82f6', pending: '#94a3b8', empty: '#cbd5e1',
  };

  // ── Module summary table ──────────────────────────────────────────────────
  const summaryRows = flow.modules.map(mod => {
    const st  = modStatus(mod);
    const ms  = modStats(mod);
    const sm  = STATUS_META[st];
    const mc  = MOD_COLOR[st] ?? MOD_COLOR.pending;
    const sc  = SIDE_COLOR[mod.side] ?? '#1d4ed8';
    const pct = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;
    const barPass = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;
    const barFail = ms.total > 0 ? Math.round(ms.fail / ms.total * 100) : 0;
    const barNt   = 100 - barPass - barFail;
    return `
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:10px 14px;white-space:nowrap">
        <span style="font-family:monospace;font-size:12px;font-weight:700;color:${sc};background:${SIDE_BG[mod.side]};border:1px solid ${sc}22;border-radius:5px;padding:2px 8px">${esc(mod.label)}</span>
      </td>
      <td style="padding:10px 14px">
        <div style="font-weight:600;font-size:13px">${esc(mod.name)}</div>
        ${mod.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${esc(mod.note)}</div>` : ''}
      </td>
      <td style="padding:10px 14px">
        <span style="font-size:11px;font-weight:600;color:${sc};background:${SIDE_BG[mod.side]};padding:2px 8px;border-radius:4px">${esc(mod.side)}</span>
      </td>
      <td style="padding:10px 14px">
        <span style="font-size:11px;font-weight:600;color:${mc.color};background:${mc.bg};border:1px solid ${mc.border};padding:3px 10px;border-radius:99px">${sm.label}</span>
      </td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#16a34a">${ms.pass}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#dc2626">${ms.fail}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;color:#94a3b8">${ms.untested}</td>
      <td style="padding:10px 14px;min-width:120px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;border-radius:99px;overflow:hidden;background:#f1f5f9;display:flex">
            <div style="height:100%;width:${barPass}%;background:#16a34a"></div>
            <div style="height:100%;width:${barFail}%;background:#dc2626"></div>
            <div style="height:100%;width:${barNt}%;background:#e2e8f0"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:#1d4ed8;white-space:nowrap">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  // ── Detailed module cards ─────────────────────────────────────────────────
  const modulesHtml = flow.modules.map(mod => {
    const st        = modStatus(mod);
    const mc        = MOD_COLOR[st] ?? MOD_COLOR.pending;
    const sm        = STATUS_META[st];
    const ms        = modStats(mod);
    const sc        = SIDE_COLOR[mod.side] ?? '#1d4ed8';
    const leftColor = MOD_LEFT[st] ?? '#cbd5e1';
    const barPass   = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;
    const barFail   = ms.total > 0 ? Math.round(ms.fail / ms.total * 100) : 0;
    const barNt     = 100 - barPass - barFail;
    const pct       = ms.total > 0 ? Math.round(ms.pass / ms.total * 100) : 0;

    const scenariosHtml = mod.scenarios.length === 0 ? '' : mod.scenarios.map(sc2 => {
      const sst   = scenarioStatus(sc2);
      const sit   = scenarioIssueType(sc2);
      const sPass = sc2.steps.filter(s => s.status === 'pass').length;
      const sFail = sc2.steps.filter(s => s.status === 'fail').length;
      const sNt   = sc2.steps.filter(s => s.status === 'untested').length;
      const sstColor = sst === 'pass' ? '#16a34a' : sst === 'fail' ? '#dc2626' : '#94a3b8';
      const sstBg    = sst === 'pass' ? '#f0fdf4' : sst === 'fail' ? '#fef2f2' : '#f8fafc';
      const sstBd    = sst === 'pass' ? '#bbf7d0' : sst === 'fail' ? '#fecaca' : '#e2e8f0';
      const sstLabel = sst === 'pass' ? '✓ PASS' : sst === 'fail' ? '✗ FAIL' : 'N/T';

      const stepsHtml = sc2.steps.map((step, si) => {
        const imgs   = parseImages(step.evidence_image);
        const stColor = step.status === 'pass' ? '#16a34a' : step.status === 'fail' ? '#dc2626' : '#94a3b8';
        const stBg    = step.status === 'pass' ? '#f0fdf4' : step.status === 'fail' ? '#fef2f2' : '#f8fafc';
        const stBd    = step.status === 'pass' ? '#bbf7d0' : step.status === 'fail' ? '#fecaca' : '#e2e8f0';
        const stLabel = step.status === 'pass' ? '✓ Pass' : step.status === 'fail' ? '✗ Fail' : 'N/T';
        const issueColor = step.issue_type === 'blocker' ? '#dc2626' : step.issue_type === 'major' ? '#d97706' : '#f59e0b';

        return `
        <tr style="border-top:1px solid #f8fafc;${si % 2 === 0 ? '' : 'background:#fafafa'}">
          <td style="padding:9px 12px;color:#94a3b8;font-size:11px;font-weight:600;white-space:nowrap;vertical-align:top;width:56px">
            <span style="background:#f1f5f9;border-radius:4px;padding:2px 6px">Step ${si + 1}</span>
          </td>
          <td style="padding:9px 12px;font-size:12.5px;color:#1e293b;vertical-align:top;line-height:1.5">${esc(step.description)}</td>
          <td style="padding:9px 12px;font-size:12px;color:#64748b;vertical-align:top;line-height:1.5">${esc(step.expected)}</td>
          <td style="padding:9px 12px;text-align:center;vertical-align:top;white-space:nowrap">
            <span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${stBg};color:${stColor};border:1px solid ${stBd}">${stLabel}</span>
          </td>
          <td style="padding:9px 12px;vertical-align:top;white-space:nowrap">
            ${step.issue_type ? `<span style="font-size:11px;font-weight:700;color:${issueColor};background:${issueColor}18;border:1px solid ${issueColor}33;border-radius:4px;padding:2px 7px">${step.issue_type.toUpperCase()}</span>` : ''}
          </td>
          <td style="padding:9px 12px;font-size:11px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(step.date_tested)}</td>
          <td style="padding:9px 12px;vertical-align:top;white-space:nowrap">
            ${step.ado_ticket ? `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:500">${esc(step.ado_ticket)}</span>` : ''}
          </td>
          <td style="padding:9px 12px;vertical-align:top">
            ${step.evidence_url ? `<a href="${esc(step.evidence_url)}" target="_blank" style="font-size:11px;color:#1d4ed8;text-decoration:none;border:1px solid #bfdbfe;padding:2px 7px;border-radius:5px;background:#eff6ff">🔗 Link</a>` : ''}
          </td>
          <td style="padding:9px 12px;vertical-align:top">
            ${step.remarks ? `<div style="font-size:11px;color:#64748b;max-width:180px;line-height:1.4">${esc(step.remarks)}</div>` : ''}
          </td>
          <td style="padding:9px 12px;vertical-align:top">
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${imgs.map(url => `<img src="${esc(url)}" onclick="window.open('${esc(url)}')" style="width:52px;height:52px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;cursor:pointer;transition:opacity .15s" onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'" />`).join('')}
            </div>
          </td>
        </tr>`;
      }).join('');

      return `
      <div style="margin-bottom:14px;border:1px solid ${sstBd};border-radius:9px;overflow:hidden">
        <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;background:${sstBg};flex-wrap:wrap">
          <span style="font-family:monospace;font-size:11.5px;font-weight:700;background:#fff;border:1px solid ${sstBd};border-radius:5px;padding:2px 8px;color:${sstColor};flex-shrink:0">${esc(sc2.blid)}</span>
          <span style="font-size:13px;font-weight:600;flex:1;color:#0f172a">${esc(sc2.description)}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            ${sPass > 0 ? `<span style="font-size:11px;color:#16a34a;font-weight:600">✓ ${sPass}</span>` : ''}
            ${sFail > 0 ? `<span style="font-size:11px;color:#dc2626;font-weight:600">✗ ${sFail}</span>` : ''}
            ${sNt   > 0 ? `<span style="font-size:11px;color:#94a3b8">· ${sNt} N/T</span>` : ''}
            <span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:#fff;color:${sstColor};border:1px solid ${sstBd}">${sstLabel}</span>
            ${sit ? `<span style="font-size:11px;font-weight:700;color:${sit === 'blocker' ? '#dc2626' : '#d97706'};background:${sit === 'blocker' ? '#fef2f2' : '#fffbeb'};border:1px solid ${sit === 'blocker' ? '#fecaca' : '#fde68a'};padding:2px 8px;border-radius:4px">${sit.toUpperCase()}</span>` : ''}
          </div>
        </div>
        ${sc2.steps.length > 0 ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f8fafc;border-bottom:1px solid #f1f5f9">
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em;white-space:nowrap">STEP</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">DESCRIPTION</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">EXPECTED</th>
                <th style="padding:7px 12px;text-align:center;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">STATUS</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">ISSUE</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em;white-space:nowrap">DATE</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">ADO</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">EVIDENCE</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">REMARKS</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.07em">SCREENSHOTS</th>
              </tr>
            </thead>
            <tbody>${stepsHtml}</tbody>
          </table>
        </div>` : ''}
      </div>`;
    }).join('');

    return `
    <div style="margin-bottom:28px;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;border-left:4px solid ${leftColor};page-break-inside:avoid">
      <div style="padding:14px 18px;background:#fff;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9">
        <span style="font-family:monospace;font-size:13px;font-weight:800;color:${sc};background:${SIDE_BG[mod.side]};border:1px solid ${sc}33;border-radius:6px;padding:3px 10px">${esc(mod.label)}</span>
        <span style="font-size:15px;font-weight:700;flex:1;color:#0f172a">${esc(mod.name)}</span>
        ${mod.note ? `<span style="font-size:11px;color:#64748b;font-style:italic">${esc(mod.note)}</span>` : ''}
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:11px;font-weight:700;color:${sc};background:${SIDE_BG[mod.side]};padding:2px 8px;border-radius:4px">${esc(mod.side)}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:80px;height:6px;border-radius:99px;overflow:hidden;background:#f1f5f9;display:flex">
              <div style="height:100%;width:${barPass}%;background:#16a34a"></div>
              <div style="height:100%;width:${barFail}%;background:#dc2626"></div>
              <div style="height:100%;width:${barNt}%;background:#e2e8f0"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:#1d4ed8">${pct}%</span>
          </div>
          <div style="display:flex;gap:6px;font-size:11px;font-weight:600">
            <span style="color:#16a34a">✓ ${ms.pass}</span>
            <span style="color:#dc2626">✗ ${ms.fail}</span>
            <span style="color:#94a3b8">· ${ms.untested}</span>
          </div>
          <span style="font-size:11px;font-weight:600;color:${mc.color};background:${mc.bg};border:1px solid ${mc.border};padding:3px 10px;border-radius:99px">${sm.label}</span>
        </div>
      </div>
      <div style="padding:14px 16px;background:#fafafa">${scenariosHtml}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Test Report — ${esc(flow.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#1e293b;font-size:14px;line-height:1.5}
    @media print{
      body{background:#fff}
      .no-print{display:none!important}
      @page{margin:12mm}
      div[style*="page-break"]{page-break-inside:avoid}
    }
  </style>
</head>
<body>
<div style="max-width:1100px;margin:0 auto;padding:28px 20px">

  <!-- Toolbar -->
  <div class="no-print" style="display:flex;justify-content:flex-end;margin-bottom:18px">
    <button onclick="window.print()" style="display:flex;align-items:center;gap:7px;padding:9px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.01em">
      🖨 Print / Save PDF
    </button>
  </div>

  <!-- Header card -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;border-radius:14px;padding:32px 36px;margin-bottom:24px;box-shadow:0 4px 20px rgba(0,0,0,.18)">
    <div style="font-size:10.5px;font-weight:700;letter-spacing:.14em;color:#64748b;text-transform:uppercase;margin-bottom:10px">Test Execution Report</div>
    <div style="font-size:28px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px">${esc(flow.name)}</div>
    ${flow.description ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:20px">${esc(flow.description)}</div>` : '<div style="margin-bottom:20px"></div>'}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      ${[
        { val: stats.pass,       label: 'Pass',         color: '#4ade80' },
        { val: stats.fail,       label: 'Fail',         color: '#f87171' },
        { val: stats.untested,   label: 'Untested',     color: '#94a3b8' },
        { val: passPct + '%',    label: 'Pass Rate',    color: '#60a5fa' },
        { val: stats.blidPct + '%', label: 'BLID Cov.', color: '#c084fc' },
        { val: execPct + '%',    label: 'Executed',     color: '#fbbf24' },
      ].map(s => `
        <div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:14px 20px;min-width:90px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:${s.color};line-height:1">${s.val}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:5px;letter-spacing:.06em;text-transform:uppercase">${s.label}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:11px;color:#475569">Generated ${dateStr} &nbsp;·&nbsp; ${flow.modules.length} modules &nbsp;·&nbsp; ${totalScenarios} scenarios &nbsp;·&nbsp; ${stats.total} steps</div>
  </div>

  <!-- Module summary table -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;margin-bottom:28px">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px">
      <span style="font-size:13px;font-weight:700;color:#0f172a">Module Summary</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:4px">${flow.modules.length} modules</span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase">ID</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase">Module</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase">Side</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase">Status</th>
            <th style="padding:9px 14px;text-align:center;font-size:10px;font-weight:700;color:#16a34a;letter-spacing:.07em;text-transform:uppercase">Pass</th>
            <th style="padding:9px 14px;text-align:center;font-size:10px;font-weight:700;color:#dc2626;letter-spacing:.07em;text-transform:uppercase">Fail</th>
            <th style="padding:9px 14px;text-align:center;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase">N/T</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;min-width:140px">Progress</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Detailed results -->
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
    <span style="font-size:15px;font-weight:700;color:#0f172a">Detailed Results</span>
    <span style="font-size:12px;color:#94a3b8">${totalScenarios} scenarios across ${flow.modules.length} modules</span>
  </div>
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
  const scHeaders = ['Module ID', 'Module Name', 'Side', 'Module Status', 'BLID', 'Scenario', 'Steps', 'Pass', 'Fail', 'Untested', 'Scenario Status', 'Issue Type'];
  const scRows: (string | number)[][] = [scHeaders];
  for (const mod of flow.modules) {
    const mst = STATUS_META[modStatus(mod)].label.replace(/[^\w\s]/g, '').trim();
    for (const sc of mod.scenarios) {
      const sst = scenarioStatus(sc);
      const sit = scenarioIssueType(sc);
      const pass     = sc.steps.filter(s => s.status === 'pass').length;
      const fail     = sc.steps.filter(s => s.status === 'fail').length;
      const untested = sc.steps.filter(s => s.status === 'untested').length;
      scRows.push([
        mod.label, mod.name, mod.side, mst,
        sc.blid, sc.description, sc.steps.length, pass, fail, untested,
        sst === 'pass' ? 'PASS' : sst === 'fail' ? 'FAIL' : 'N/T',
        sit ? sit.toUpperCase() : '',
      ]);
    }
    if (mod.scenarios.length === 0) {
      scRows.push([mod.label, mod.name, mod.side, mst, '', '', 0, 0, 0, 0, '', '']);
    }
  }
  const wsScenarios = XLSX.utils.aoa_to_sheet(scRows);
  wsScenarios['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsScenarios, 'Scenarios');

  // ── Sheet 3: Steps ────────────────────────────────────────────────────────
  const stHeaders = ['Module ID', 'Module Name', 'BLID', 'Scenario', 'Step No', 'Step Description', 'Expected', 'Status', 'Issue Type', 'Date Tested', 'ADO Ticket', 'Evidence URL', 'Remarks'];
  const stRows: (string | number)[][] = [stHeaders];
  for (const mod of flow.modules) {
    for (const sc of mod.scenarios) {
      if (sc.steps.length === 0) {
        stRows.push([mod.label, mod.name, sc.blid, sc.description, '', '', '', '', '', '', '', '', '']);
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
