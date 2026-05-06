import type { Flow, Module, Scenario, ModuleStatus, FlowStats, ModStats } from './types';

export function scenarioStatus(sc: Scenario): 'pass' | 'fail' | 'untested' {
  if (!sc.steps.length) return 'untested';

  // Only a step with issue_type='blocker' makes the whole scenario fail
  if (sc.steps.some(s => s.status === 'fail' && s.issue_type === 'blocker')) return 'fail';

  // Pass if every step is either: passed, or failed with a classified non-blocker issue (major/minor)
  const allResolved = sc.steps.every(s =>
    s.status === 'pass' ||
    (s.status === 'fail' && s.issue_type !== null && s.issue_type !== 'blocker')
  );
  if (allResolved) return 'pass';

  return 'untested';
}

export function scenarioIssueType(sc: Scenario): 'blocker' | 'major' | 'minor' | null {
  const failed = sc.steps.filter(s => s.status === 'fail');
  if (failed.some(s => s.issue_type === 'blocker')) return 'blocker';
  if (failed.some(s => s.issue_type === 'major')) return 'major';
  if (failed.some(s => s.issue_type === 'minor')) return 'minor';
  return null;
}

export function modStatus(mod: Module): ModuleStatus {
  const sc = mod.scenarios;
  if (!sc.length) return 'empty';
  const statuses   = sc.map(scenarioStatus);
  const issueTypes = sc.map(scenarioIssueType);

  // Blocked: any scenario failed due to a blocker step
  if (statuses.some(st => st === 'fail')) return 'blocked';

  // Major/minor: scenarios passed but have non-blocker issue steps
  if (issueTypes.some(it => it === 'major')) return 'major';
  if (issueTypes.some(it => it === 'minor')) return 'minor';

  // Complete: all scenarios fully passed (no issues at all)
  if (statuses.every(st => st === 'pass')) return 'complete';

  // In progress: at least one scenario passed/resolved
  if (statuses.some(st => st === 'pass')) return 'progress';

  return 'pending';
}

export function getSlots(modules: Module[]): Module[][] {
  const sorted = [...modules].sort((a, b) => a.order_idx - b.order_idx);
  const slots: Module[][] = [];
  const groupMap = new Map<string, Module[]>();
  for (const mod of sorted) {
    if (!mod.parallel_group) {
      slots.push([mod]);
    } else {
      if (!groupMap.has(mod.parallel_group)) {
        const slot: Module[] = [];
        groupMap.set(mod.parallel_group, slot);
        slots.push(slot);
      }
      groupMap.get(mod.parallel_group)!.push(mod);
    }
  }
  return slots;
}

export function slotStatus(slot: Module[]): ModuleStatus {
  if (slot.length === 1) return modStatus(slot[0]);
  const statuses = slot.map(modStatus);
  if (statuses.some(s => s === 'blocked'))   return 'blocked';
  if (statuses.some(s => s === 'major'))     return 'major';
  if (statuses.some(s => s === 'minor'))     return 'minor';
  if (statuses.every(s => s === 'complete')) return 'complete';
  if (statuses.some(s => s === 'progress' || s === 'complete')) return 'progress';
  return 'pending';
}

export function isGated(flow: Flow, modIdx: number): boolean {
  const target     = flow.modules[modIdx];
  const slots      = getSlots(flow.modules);
  const targetSlot = slots.findIndex(s => s.some(m => m.id === target.id));
  for (let i = 0; i < targetSlot; i++) {
    if (slotStatus(slots[i]) === 'blocked') return true;
  }
  return false;
}

export function modStats(mod: Module): ModStats {
  const statuses = mod.scenarios.map(scenarioStatus);
  return {
    pass:     statuses.filter(s => s === 'pass').length,
    fail:     statuses.filter(s => s === 'fail').length,
    untested: statuses.filter(s => s === 'untested').length,
    total:    statuses.length,
  };
}

export function flowStats(flow: Flow): FlowStats {
  const all    = flow.modules.flatMap(m => m.scenarios);
  const blids  = [...new Set(all.map(s => s.blid).filter(Boolean))];
  const passedBlids = blids.filter(b => all.filter(s => s.blid === b).some(s => scenarioStatus(s) === 'pass'));
  const failedBlids = blids.filter(b => all.filter(s => s.blid === b).some(s => scenarioStatus(s) === 'fail'));
  const untestedBlids = blids.filter(b => all.filter(s => s.blid === b).every(s => scenarioStatus(s) === 'untested'));
  const tested = all.filter(s => scenarioStatus(s) !== 'untested').length;
  return {
    total:     all.length,
    pass:      all.filter(s => scenarioStatus(s) === 'pass').length,
    fail:      all.filter(s => scenarioStatus(s) === 'fail').length,
    untested:  all.filter(s => scenarioStatus(s) === 'untested').length,
    blidTotal: blids.length,
    blidPass:  passedBlids.length,
    blidFail:  failedBlids.length,
    blidUntested: untestedBlids.length,
    blidPct:   blids.length ? Math.round(passedBlids.length / blids.length * 100) : 0,
    execPct:   all.length   ? Math.round(tested / all.length * 100) : 0,
  };
}

export const STATUS_META: Record<ModuleStatus, { label: string; cls: string }> = {
  complete: { label: '✓ Complete',     cls: 'st-complete' },
  blocked:  { label: '🔒 Blocked',     cls: 'st-blocked'  },
  major:    { label: '⚠ Major Issue',  cls: 'st-major'    },
  minor:    { label: '● Minor Issue',  cls: 'st-minor'    },
  progress: { label: '▷ In Progress',  cls: 'st-progress' },
  pending:  { label: 'Not Started',  cls: 'st-pending'  },
  empty:    { label: 'No Scenarios', cls: 'st-empty'    },
};

export const today = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
