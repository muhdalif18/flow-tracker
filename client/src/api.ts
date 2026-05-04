import type { Flow, Scenario, TestStep } from './types';

const BASE = '/api';

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('ft_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function json(r: Response, isPublic = false) {
  if (r.status === 401 && !isPublic) {
    localStorage.removeItem('ft_token');
    localStorage.removeItem('ft_userId');
    localStorage.removeItem('ft_username');
    localStorage.removeItem('ft_role');
    window.dispatchEvent(new Event('ft:logout'));
  }
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

const post = (url: string, body: object, isPublic = false) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  }).then(r => json(r, isPublic));

const put = (url: string, body: object) =>
  fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  }).then(json);

const del = (url: string) =>
  fetch(url, { method: 'DELETE', headers: authHeader() }).then(json);

const get = (url: string) =>
  fetch(url, { headers: authHeader() }).then(json);

export const api = {
  // Auth
  login: (username: string, password: string): Promise<{ token: string; userId: string; username: string; role: string }> =>
    post(`${BASE}/auth/login`, { username, password }, true),
  forgotPassword: (email: string): Promise<{ ok: boolean }> =>
    post(`${BASE}/auth/forgot-password`, { email }, true),
  resetPassword: (token: string, newPassword: string): Promise<{ ok: boolean }> =>
    post(`${BASE}/auth/reset-password`, { token, newPassword }, true),

  // Admin
  changePassword: (currentPassword: string, newPassword: string): Promise<{ ok: boolean }> =>
    put(`${BASE}/auth/change-password`, { currentPassword, newPassword }),

  adminGetUsers: (): Promise<{ id: string; username: string; role: string; created_at: string }[]> =>
    get(`${BASE}/admin/users`),
  adminCreateUser: (username: string, password: string): Promise<{ id: string; username: string; role: string }> =>
    post(`${BASE}/admin/users`, { username, password }),
  adminChangePassword: (id: string, newPassword: string): Promise<{ ok: boolean }> =>
    put(`${BASE}/admin/users/${id}/password`, { newPassword }),
  adminDeleteUser: (id: string, adminPassword: string): Promise<{ ok: boolean }> =>
    put(`${BASE}/admin/users/${id}/delete`, { adminPassword }),

  // Flows
  getFlows:   (): Promise<Flow[]>  =>
    fetch(`${BASE}/flows`, { headers: authHeader() }).then(json),
  createFlow: (name: string, description: string, group_name = ''): Promise<Flow> =>
    post(`${BASE}/flows`, { name, description, group_name }),
  updateFlow: (id: string, data: { name?: string; group_name?: string }) => put(`${BASE}/flows/${id}`, data),
  deleteFlow: (id: string) => del(`${BASE}/flows/${id}`),
  toggleCopyEnabled: (id: string, copy_enabled: boolean): Promise<{ ok: boolean }> =>
    put(`${BASE}/flows/${id}/copy-enabled`, { copy_enabled }),
  copyFlow: (id: string): Promise<Flow> =>
    post(`${BASE}/flows/${id}/copy`, {}),

  // Modules
  addModule: (flowId: string, data: { label: string; name: string; side: string; note: string; parallel_group?: string }) =>
    post(`${BASE}/flows/${flowId}/modules`, data),
  updateModule: (id: string, data: object) => put(`${BASE}/modules/${id}`, data),
  deleteModule: (id: string) => del(`${BASE}/modules/${id}`),
  reorderModule: (flowId: string, moduleId: string, direction: -1 | 1) =>
    put(`${BASE}/flows/${flowId}/modules/reorder`, { moduleId, direction }),

  // Scenarios
  addScenario: (moduleId: string, data: { blid: string; description: string }) =>
    post(`${BASE}/modules/${moduleId}/scenarios`, data),
  updateScenario: (id: string, data: Partial<Scenario>) =>
    put(`${BASE}/scenarios/${id}`, data),
  deleteScenario: (id: string) => del(`${BASE}/scenarios/${id}`),

  // Scenarios
  reorderScenario: (moduleId: string, scenarioId: string, newIndex: number) =>
    put(`${BASE}/modules/${moduleId}/scenarios/reorder`, { scenarioId, newIndex }),
  reorderStep: (scenarioId: string, stepId: string, newIndex: number) =>
    put(`${BASE}/scenarios/${scenarioId}/steps/reorder`, { stepId, newIndex }),

  // Steps
  addStep: (scenarioId: string, data: { description: string; expected: string }) =>
    post(`${BASE}/scenarios/${scenarioId}/steps`, data),
  updateStep: (id: string, data: Partial<TestStep>) => put(`${BASE}/steps/${id}`, data),
  deleteStep: (id: string) => del(`${BASE}/steps/${id}`),
  copyStep: (stepId: string, targetScenarioId: string) =>
    post(`${BASE}/steps/${stepId}/copy`, { targetScenarioId }),

  // Image upload
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append('image', file);
    const r = await fetch(`${BASE}/upload`, { method: 'POST', headers: authHeader(), body: fd });
    return json(r);
  },
};
