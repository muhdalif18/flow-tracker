export interface TestStep {
  id: string;
  scenario_id: string;
  description: string;
  expected: string;
  status: 'untested' | 'pass' | 'fail';
  issue_type: 'blocker' | 'major' | 'minor' | null;
  date_tested: string;
  ado_ticket: string;
  evidence_url: string;
  evidence_image: string | null;
  remarks: string;
  order_idx: number;
}

export interface Scenario {
  id: string;
  module_id: string;
  blid: string;
  description: string;
  order_idx: number;
  steps: TestStep[];
}

export interface Module {
  id: string;
  flow_id: string;
  label: string;
  name: string;
  side: 'eDS' | 'HITS';
  note: string;
  parallel_group: string | null;
  order_idx: number;
  created_by: string | null;
  created_by_name: string | null;
  scenarios: Scenario[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  group_name: string;
  created_at: string;
  order_idx: number;
  created_by: string | null;
  created_by_name: string | null;
  copy_enabled: boolean;
  modules: Module[];
}

export type ModuleStatus = 'complete' | 'blocked' | 'major' | 'minor' | 'progress' | 'pending' | 'empty';
export type ActiveTab = 'diagram' | 'scenarios' | 'blid' | 'overview';

export interface FlowStats {
  total: number;
  pass: number;
  fail: number;
  untested: number;
  blidTotal: number;
  blidPass: number;
  blidFail: number;
  blidUntested: number;
  blidPct: number;
  execPct: number;
}

export interface ModStats {
  pass: number;
  fail: number;
  untested: number;
  total: number;
}
