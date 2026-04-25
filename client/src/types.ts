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
  order_idx: number;
  created_by: string | null;
  created_by_name: string | null;
  scenarios: Scenario[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  order_idx: number;
  created_by: string | null;
  created_by_name: string | null;
  modules: Module[];
}

export type ModuleStatus = 'complete' | 'blocked' | 'major' | 'minor' | 'progress' | 'pending' | 'empty';
export type ActiveTab = 'diagram' | 'scenarios' | 'blid';

export interface FlowStats {
  total: number;
  pass: number;
  fail: number;
  untested: number;
  blidTotal: number;
  blidPass: number;
  blidPct: number;
  execPct: number;
}

export interface ModStats {
  pass: number;
  fail: number;
  untested: number;
  total: number;
}
