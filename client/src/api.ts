import type { Flow, Scenario, TestStep } from './types';

const BASE = '/api';
const json = (r: Response) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); };
const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);
const put  = (url: string, body: object) => fetch(url, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);
const del  = (url: string) => fetch(url, { method: 'DELETE' }).then(json);

export const api = {
  // Flows
  getFlows:   (): Promise<Flow[]>  => fetch(`${BASE}/flows`).then(json),
  createFlow: (name: string, description: string): Promise<Flow> => post(`${BASE}/flows`, { name, description }),
  deleteFlow: (id: string)  => del(`${BASE}/flows/${id}`),

  // Modules
  addModule: (flowId: string, data: { label: string; name: string; side: string; note: string }) =>
    post(`${BASE}/flows/${flowId}/modules`, data),
  updateModule: (id: string, data: object) => put(`${BASE}/modules/${id}`, data),
  deleteModule: (id: string) => del(`${BASE}/modules/${id}`),
  reorderModule: (flowId: string, moduleId: string, direction: -1 | 1) =>
    put(`${BASE}/flows/${flowId}/modules/reorder`, { moduleId, direction }),

  // Scenarios
  addScenario: (moduleId: string, data: { blid: string; description: string }) =>
    post(`${BASE}/modules/${moduleId}/scenarios`, data),
  updateScenario: (id: string, data: Partial<Scenario>) => put(`${BASE}/scenarios/${id}`, data),
  deleteScenario: (id: string) => del(`${BASE}/scenarios/${id}`),

  // Steps
  addStep: (scenarioId: string, data: { description: string; expected: string }) =>
    post(`${BASE}/scenarios/${scenarioId}/steps`, data),
  updateStep: (id: string, data: Partial<TestStep>) => put(`${BASE}/steps/${id}`, data),
  deleteStep: (id: string) => del(`${BASE}/steps/${id}`),

  // Image upload
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append('image', file);
    const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
    return json(r);
  },
};
