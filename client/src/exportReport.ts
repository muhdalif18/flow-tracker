import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Flow } from './types';
import { flowStats, modStatus, scenarioStatus, scenarioIssueType, STATUS_META, modStats } from './utils';

// Helper to parse multiple ADO tickets
function parseAdoTickets(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateDDMMYYYY(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';

  // ISO date from date input: yyyy-mm-dd
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // Legacy stored format: dd Mon yyyy
  const legacy = v.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})$/);
  if (legacy) {
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const dd = legacy[1].padStart(2, '0');
    const mm = monthMap[legacy[2].toLowerCase()];
    const yyyy = legacy[3];
    if (mm) return `${dd}/${mm}/${yyyy}`;
  }

  return v;
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

export function exportReport(input: Flow | Flow[], opts: { onlyFailed?: boolean } = {}) {
  // Normalise to array; preserve per-flow identity for labelling
  const inputFlows: Flow[] = Array.isArray(input) ? input : [input];
  const isGroup = inputFlows.length > 1;
  const reportTitle = isGroup
    ? (inputFlows[0].group_name?.trim() || 'Group Report')
    : inputFlows[0].name;
  const reportDescription = isGroup
    ? `${inputFlows.length} flows: ${inputFlows.map(f => f.name).join(', ')}`
    : inputFlows[0].description;

  // Filter to only failed scenarios if requested, per flow
  const filteredFlows: Flow[] = inputFlows.map(flow => opts.onlyFailed ? {
    ...flow,
    modules: flow.modules.map(m => ({
      ...m,
      scenarios: m.scenarios.filter(sc => sc.steps.some(s => s.status === 'fail')),
    })).filter(m => m.scenarios.length > 0),
  } : flow);

  // Aggregate stats across all flows
  const allStats = filteredFlows.map(flowStats);
  const stats = {
    pass:     allStats.reduce((n, s) => n + s.pass, 0),
    fail:     allStats.reduce((n, s) => n + s.fail, 0),
    untested: allStats.reduce((n, s) => n + s.untested, 0),
    total:    allStats.reduce((n, s) => n + s.total, 0),
    blidPct:  Math.round(allStats.reduce((n, s) => n + s.blidPass, 0) / Math.max(allStats.reduce((n, s) => n + s.blidTotal, 0), 1) * 100),
    blidPass: allStats.reduce((n, s) => n + s.blidPass, 0),
    blidTotal:allStats.reduce((n, s) => n + s.blidTotal, 0),
    execPct:  0, passPct: 0,
  };

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalScenarios = filteredFlows.reduce((n, f) => f.modules.reduce((n2, m) => n2 + m.scenarios.length, n), 0);
  const totalMods      = filteredFlows.reduce((n, f) => n + f.modules.length, 0);
  const execPct = stats.total > 0 ? Math.round((stats.pass + stats.fail) / stats.total * 100) : 0;
  const passPct = stats.total > 0 ? Math.round(stats.pass / stats.total * 100) : 0;

  // ── BLID Coverage Summary ─────────────────────────────────────────────────
  const blidSummaryMap = new Map<string, { blid: string; desc: string; status: 'pass' | 'fail' | 'untested'; issue: string | null }>();
  for (const f of filteredFlows) {
    const fAll = f.modules.flatMap(m => m.scenarios);
    for (const sc of fAll) {
      if (sc.blid && !blidSummaryMap.has(sc.blid)) {
        const status = scenarioStatus(sc);
        const issue = scenarioIssueType(sc);
        blidSummaryMap.set(sc.blid, { blid: sc.blid, desc: sc.description, status, issue });
      }
    }
  }
  const allBLIDsSummary = [...blidSummaryMap.values()].sort((a, b) => a.blid.localeCompare(b.blid));
  const blidPassCount = allBLIDsSummary.filter(b => b.status === 'pass').length;
  const blidFailCount = allBLIDsSummary.filter(b => b.status === 'fail').length;
  const blidUntestedCount = allBLIDsSummary.filter(b => b.status === 'untested').length;

  const SIDE_COLOR: Record<string, string> = { eDS: '#1d4ed8', HITS: '#7c3aed' };
  const SIDE_BG:    Record<string, string> = { eDS: '#eff6ff', HITS: '#f5f3ff' };

  const MOD_LEFT: Record<string, string> = {
    complete: '#16a34a', blocked: '#dc2626', major: '#d97706',
    minor: '#f59e0b', progress: '#3b82f6', pending: '#94a3b8', empty: '#cbd5e1',
  };

  // ── Flow section header row (only in group reports) ───────────────────────
  const flowHeaderRow = (flow: Flow) => isGroup ? `
    <tr>
      <td colspan="8" style="padding:12px 14px 6px;border-top:2px solid #e2e8f0;border-bottom:1px solid #f1f5f9;background:#f8fafc">
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.07em">${esc(flow.name)}</span>
        </div>
      </td>
    </tr>` : '';

  // ── Module summary table ──────────────────────────────────────────────────
  const summaryRows = filteredFlows.flatMap(fl => [
    flowHeaderRow(fl),
    ...fl.modules.map(mod => {
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
    })
  ]).join('');

  // ── Detailed module cards ─────────────────────────────────────────────────
  const modulesHtml = filteredFlows.flatMap(fl => [
    isGroup ? `
    <div style="margin-bottom:8px;margin-top:20px;padding:10px 16px;background:linear-gradient(90deg,#1e3a5f,#0f2a4a);border-radius:10px;display:flex;align-items:center;gap:10px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.01em">${esc(fl.name)}</span>
      <span style="font-size:11px;color:#64748b">${fl.modules.length} modules · ${fl.modules.reduce((n,m) => n+m.scenarios.length,0)} scenarios</span>
    </div>` : '',
    ...fl.modules.map(mod => {
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
        const stColor = step.status === 'pass' ? '#16a34a' : step.status === 'fail' ? '#dc2626' : '#94a3b8';
        const stBg    = step.status === 'pass' ? '#f0fdf4' : step.status === 'fail' ? '#fef2f2' : '#f8fafc';
        const stBd    = step.status === 'pass' ? '#bbf7d0' : step.status === 'fail' ? '#fecaca' : '#e2e8f0';
        const stLabel = step.status === 'pass' ? '✓ Pass' : step.status === 'fail' ? '✗ Fail' : 'N/T';
        const issueColor = step.issue_type === 'blocker' ? '#dc2626' : step.issue_type === 'major' ? '#d97706' : '#f59e0b';

        // Parse ADO tickets and determine if resolved (step is now passing)
        const adoTickets = parseAdoTickets(step.ado_ticket);
        const isResolved = step.status === 'pass';
        const adoHtml = adoTickets.length > 0
          ? adoTickets.map(ticket =>
              `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:500;margin-right:4px;${isResolved ? 'text-decoration:line-through;opacity:0.6;' : ''}">${esc(ticket)}</span>`
            ).join('')
          : '';

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
          <td style="padding:9px 12px;font-size:11px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(formatDateDDMMYYYY(step.date_tested))}</td>
          <td style="padding:9px 12px;vertical-align:top;">
            ${adoHtml}
          </td>
          <td style="padding:9px 12px;vertical-align:top;white-space:nowrap">
            ${step.evidence_url ? `<a href="${esc(step.evidence_url)}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:#1d4ed8;text-decoration:none;border:1px solid #bfdbfe;padding:3px 9px;border-radius:5px;background:#eff6ff;white-space:nowrap"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Link</a>` : ''}
          </td>
          <td style="padding:9px 12px;vertical-align:top;min-width:160px">
            ${step.remarks ? `<div style="font-size:11.5px;color:#475569;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(step.remarks)}</div>` : ''}
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
    })
  ]).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Test Report — ${esc(reportTitle)}</title>
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
    <div style="font-size:28px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px">${esc(reportTitle)}</div>
    ${reportDescription ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:20px">${esc(reportDescription)}</div>` : '<div style="margin-bottom:20px"></div>'}
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
    <div style="font-size:11px;color:#475569">Generated ${dateStr} &nbsp;·&nbsp; ${totalMods} modules &nbsp;·&nbsp; ${totalScenarios} scenarios &nbsp;·&nbsp; ${stats.total} steps</div>
  </div>

  <!-- Module summary table -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;margin-bottom:28px">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px">
      <span style="font-size:13px;font-weight:700;color:#0f172a">Module Summary</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:4px">${totalMods} modules</span>
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

  <!-- BLID Coverage Summary -->
  ${allBLIDsSummary.length > 0 ? `
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;margin-bottom:28px">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:#0f172a">BLID Coverage Summary</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:4px">${allBLIDsSummary.length} BLIDs</span>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;font-family:monospace;font-weight:600">
        <span style="color:#16a34a">${blidPassCount} Pass</span>
        <span style="color:#dc2626">${blidFailCount} Fail</span>
        <span style="color:#94a3b8">${blidUntestedCount} Untested</span>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;width:15%">BLID Number</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;width:60%">BLID Name / Description</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;width:15%">Status</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;width:10%">Issue</th>
          </tr>
        </thead>
        <tbody>
          ${allBLIDsSummary.map(b => {
            const statusColor = b.status === 'pass' ? '#16a34a' : b.status === 'fail' ? '#dc2626' : '#94a3b8';
            const statusBg = b.status === 'pass' ? '#f0fdf4' : b.status === 'fail' ? '#fef2f2' : '#f8fafc';
            const statusBorder = b.status === 'pass' ? '#bbf7d0' : b.status === 'fail' ? '#fecaca' : '#e2e8f0';
            const statusLabel = b.status === 'pass' ? '✓ Pass' : b.status === 'fail' ? '✗ Fail' : 'N/T';
            const issueColor = b.issue === 'blocker' ? '#dc2626' : b.issue === 'major' ? '#d97706' : '#f59e0b';
            return `
            <tr style="border-bottom:1px solid #f1f5f9;background:${b.status === 'fail' ? 'rgba(220,38,38,.02)' : b.status === 'pass' ? 'rgba(22,163,74,.02)' : '#fff'}">
              <td style="padding:10px 14px">
                <span style="font-family:monospace;font-size:12px;font-weight:700;color:${statusColor}">${esc(b.blid)}</span>
              </td>
              <td style="padding:10px 14px;font-size:12px;color:#1e293b">${esc(b.desc)}</td>
              <td style="padding:10px 14px">
                <span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder}">${statusLabel}</span>
              </td>
              <td style="padding:10px 14px">
                ${b.issue ? `<span style="font-size:10px;font-weight:700;color:${issueColor};background:${issueColor}18;border:1px solid ${issueColor}33;border-radius:4px;padding:2px 7px;text-transform:uppercase">${b.issue}</span>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ` : ''}

  <!-- Detailed results -->
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
    <span style="font-size:15px;font-weight:700;color:#0f172a">Detailed Results</span>
    <span style="font-size:12px;color:#94a3b8">${totalScenarios} scenarios across ${totalMods} modules</span>
  </div>
  ${modulesHtml}

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateStr.replace(/ /g, '_')}.html`;
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
    ['BLID Pass',       stats.blidPass],
    ['BLID Fail',       stats.blidFail],
    ['BLID Untested',   stats.blidUntested],
    ['BLID Total',      stats.blidTotal],
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

  // ── Sheet 2: BLID Coverage ───────────────────────────────────────────────
  const blidSummaryMap = new Map<string, { blid: string; desc: string; status: 'pass' | 'fail' | 'untested'; issue: string | null }>();
  const fAll = flow.modules.flatMap(m => m.scenarios);
  for (const sc of fAll) {
    if (sc.blid && !blidSummaryMap.has(sc.blid)) {
      const status = scenarioStatus(sc);
      const issue = scenarioIssueType(sc);
      blidSummaryMap.set(sc.blid, { blid: sc.blid, desc: sc.description, status, issue });
    }
  }
  const allBLIDsSummary = [...blidSummaryMap.values()].sort((a, b) => a.blid.localeCompare(b.blid));

  const blidHeaders = ['BLID Number', 'BLID Name / Description', 'Status', 'Issue Type'];
  const blidRows: (string | number)[][] = [blidHeaders];
  for (const b of allBLIDsSummary) {
    blidRows.push([
      b.blid,
      b.desc,
      b.status === 'pass' ? 'PASS' : b.status === 'fail' ? 'FAIL' : 'UNTESTED',
      b.issue ? b.issue.toUpperCase() : '',
    ]);
  }
  const wsBLID = XLSX.utils.aoa_to_sheet(blidRows);
  wsBLID['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsBLID, 'BLID Coverage');

  // ── Sheet 3: Scenarios ────────────────────────────────────────────────────
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

  // ── Sheet 4: Steps ────────────────────────────────────────────────────────
  const stHeaders = ['Module ID', 'Module Name', 'BLID', 'Scenario', 'Step No', 'Step Description', 'Expected', 'Status', 'Issue Type', 'Date Tested', 'ADO Tickets', 'Evidence URL', 'Remarks'];
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
            formatDateDDMMYYYY(step.date_tested), step.ado_ticket || '', step.evidence_url || '', step.remarks || '',
          ]);
        }
      }
    }
  }
  const wsSteps = XLSX.utils.aoa_to_sheet(stRows);
  wsSteps['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 32 }, { wch: 8 }, { wch: 36 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 32 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSteps, 'Steps');

  // ── Download ──────────────────────────────────────────────────────────────
  const filename = `${flow.name.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateStr.replace(/ /g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ── PDF export ────────────────────────────────────────────────────────────────
export async function exportPDF(input: Flow | Flow[], opts: { onlyFailed?: boolean } = {}) {
  // Normalise to array
  const inputFlows: Flow[] = Array.isArray(input) ? input : [input];
  const isGroup = inputFlows.length > 1;
  const reportTitle = isGroup
    ? (inputFlows[0].group_name?.trim() || 'Group Report')
    : inputFlows[0].name;
  const reportDescription = isGroup
    ? `${inputFlows.length} flows: ${inputFlows.map(f => f.name).join(', ')}`
    : inputFlows[0].description;

  // Filter to only failed scenarios if requested
  const filteredFlows: Flow[] = inputFlows.map(flow => opts.onlyFailed ? {
    ...flow,
    modules: flow.modules.map(m => ({
      ...m,
      scenarios: m.scenarios.filter(sc => sc.steps.some(s => s.status === 'fail')),
    })).filter(m => m.scenarios.length > 0),
  } : flow);

  // Aggregate stats
  const allStats = filteredFlows.map(flowStats);
  const stats = {
    pass:     allStats.reduce((n, s) => n + s.pass, 0),
    fail:     allStats.reduce((n, s) => n + s.fail, 0),
    untested: allStats.reduce((n, s) => n + s.untested, 0),
    total:    allStats.reduce((n, s) => n + s.total, 0),
    blidPct:  Math.round(allStats.reduce((n, s) => n + s.blidPass, 0) / Math.max(allStats.reduce((n, s) => n + s.blidTotal, 0), 1) * 100),
    blidPass: allStats.reduce((n, s) => n + s.blidPass, 0),
    blidTotal:allStats.reduce((n, s) => n + s.blidTotal, 0),
  };

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalScenarios = filteredFlows.reduce((n, f) => f.modules.reduce((n2, m) => n2 + m.scenarios.length, n), 0);
  const totalMods      = filteredFlows.reduce((n, f) => n + f.modules.length, 0);
  const execPct = stats.total > 0 ? Math.round((stats.pass + stats.fail) / stats.total * 100) : 0;
  const passPct = stats.total > 0 ? Math.round(stats.pass / stats.total * 100) : 0;

  // Create a temporary container for rendering
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.width = '210mm'; // A4 width
  container.style.background = '#fff';
  container.style.padding = '20px';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  container.style.fontSize = '12px';
  container.style.color = '#1e293b';

  // Build simplified HTML for PDF
  container.innerHTML = `
    <div style="margin-bottom:24px;padding:24px;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;border-radius:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Test Execution Report</div>
      <div style="font-size:24px;font-weight:800;margin-bottom:4px">${esc(reportTitle)}</div>
      ${reportDescription ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:16px">${esc(reportDescription)}</div>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div style="background:rgba(255,255,255,.1);border-radius:6px;padding:10px 16px;min-width:80px">
          <div style="font-size:20px;font-weight:800;color:#4ade80">${stats.pass}</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:3px;text-transform:uppercase">Pass</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:6px;padding:10px 16px;min-width:80px">
          <div style="font-size:20px;font-weight:800;color:#f87171">${stats.fail}</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:3px;text-transform:uppercase">Fail</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:6px;padding:10px 16px;min-width:80px">
          <div style="font-size:20px;font-weight:800;color:#60a5fa">${passPct}%</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:3px;text-transform:uppercase">Pass Rate</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:6px;padding:10px 16px;min-width:80px">
          <div style="font-size:20px;font-weight:800;color:#c084fc">${stats.blidPct}%</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:3px;text-transform:uppercase">BLID Cov.</div>
        </div>
      </div>
      <div style="font-size:10px;color:#64748b">Generated ${dateStr} · ${totalMods} modules · ${totalScenarios} scenarios · ${stats.total} steps</div>
    </div>

    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#0f172a">Module Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <th style="padding:8px;text-align:left;font-size:9px;color:#64748b;text-transform:uppercase">Module</th>
            <th style="padding:8px;text-align:center;font-size:9px;color:#64748b;text-transform:uppercase">Pass</th>
            <th style="padding:8px;text-align:center;font-size:9px;color:#64748b;text-transform:uppercase">Fail</th>
            <th style="padding:8px;text-align:center;font-size:9px;color:#64748b;text-transform:uppercase">N/T</th>
            <th style="padding:8px;text-align:left;font-size:9px;color:#64748b;text-transform:uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredFlows.flatMap(fl => fl.modules.map(mod => {
            const ms = modStats(mod);
            const st = modStatus(mod);
            const sm = STATUS_META[st];
            return `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:8px">
                <div style="font-weight:600">${esc(mod.label)}: ${esc(mod.name)}</div>
                <div style="font-size:9px;color:#94a3b8">${esc(mod.side)}</div>
              </td>
              <td style="padding:8px;text-align:center;color:#16a34a;font-weight:600">${ms.pass}</td>
              <td style="padding:8px;text-align:center;color:#dc2626;font-weight:600">${ms.fail}</td>
              <td style="padding:8px;text-align:center;color:#94a3b8">${ms.untested}</td>
              <td style="padding:8px;font-size:10px">${sm.label}</td>
            </tr>`;
          })).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Render to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = 297; // A4 height in mm
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Download
    const filename = `${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateStr.replace(/ /g, '_')}.pdf`;
    pdf.save(filename);
  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}
