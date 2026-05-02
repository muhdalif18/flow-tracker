import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { Flow, ActiveTab, TestStep } from './types';
import { api } from './api';

interface AppState {
  flows: Flow[];
  activeFlowId: string | null;
  activeTab: ActiveTab;
  expanded: Set<string>;
  loading: boolean;
}

type Action =
  | { type: 'SET_FLOWS'; flows: Flow[]; keepActive?: string | null }
  | { type: 'SET_ACTIVE'; id: string | null }
  | { type: 'SET_TAB'; tab: ActiveTab }
  | { type: 'TOGGLE_EXPAND'; id: string }
  | { type: 'SET_LOADING'; v: boolean };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FLOWS': {
      const activeId = action.keepActive !== undefined
        ? action.keepActive
        : (action.flows.find(f => f.id === state.activeFlowId) ? state.activeFlowId : (action.flows[0]?.id ?? null));
      return { ...state, flows: action.flows, activeFlowId: activeId, loading: false };
    }
    case 'SET_ACTIVE':  return { ...state, activeFlowId: action.id, activeTab: 'diagram' };
    case 'SET_TAB':     return { ...state, activeTab: action.tab };
    case 'SET_LOADING': return { ...state, loading: action.v };
    case 'TOGGLE_EXPAND': {
      const next = new Set(state.expanded);
      next.has(action.id) ? next.delete(action.id) : next.add(action.id);
      return { ...state, expanded: next };
    }
    default: return state;
  }
}

const init: AppState = {
  flows: [], activeFlowId: null, activeTab: 'diagram', expanded: new Set(), loading: true,
};

interface AppContextValue {
  state: AppState;
  activeFlow: Flow | undefined;
  loadFlows: () => Promise<void>;
  setActive: (id: string | null) => void;
  setTab: (tab: ActiveTab) => void;
  toggleExpand: (id: string) => void;
  createFlow: (name: string, desc: string, group?: string) => Promise<void>;
  updateFlow: (id: string, data: { name?: string; group_name?: string }) => Promise<void>;
  deleteFlow: (id: string) => Promise<void>;
  addModule: (flowId: string, data: { label: string; name: string; side: string; note: string; parallel_group?: string }) => Promise<void>;
  deleteModule: (id: string) => Promise<void>;
  moveModule: (flowId: string, moduleId: string, dir: -1 | 1) => Promise<void>;
  addScenario: (moduleId: string, data: { blid: string; description: string }) => Promise<void>;
  updateScenario: (id: string, data: object) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  moveScenario: (moduleId: string, scenarioId: string, newIndex: number) => Promise<void>;
  moveStep: (scenarioId: string, stepId: string, newIndex: number) => Promise<void>;
  addStep: (scenarioId: string, data: { description: string; expected: string }) => Promise<void>;
  updateStep: (id: string, data: Partial<TestStep>) => Promise<void>;
  deleteStep: (id: string) => Promise<void>;
  copyStep: (stepId: string, targetScenarioId: string) => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, init);

  const loadFlows = useCallback(async (keepActive?: string | null) => {
    try {
      const flows = await api.getFlows();
      dispatch({ type: 'SET_FLOWS', flows, keepActive });
    } catch (e) {
      console.error('Failed to load flows', e);
      dispatch({ type: 'SET_LOADING', v: false });
    }
  }, []);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  const createFlow = useCallback(async (name: string, desc: string, group = '') => {
    const flow = await api.createFlow(name, desc, group);
    await loadFlows(flow.id);
  }, [loadFlows]);

  const updateFlow = useCallback(async (id: string, data: { name?: string; group_name?: string }) => {
    await api.updateFlow(id, data);
    await loadFlows(state.activeFlowId);
  }, [loadFlows, state.activeFlowId]);

  const deleteFlow = useCallback(async (id: string) => {
    await api.deleteFlow(id);
    const flows = await api.getFlows();
    const newActive = flows[0]?.id ?? null;
    dispatch({ type: 'SET_FLOWS', flows, keepActive: state.activeFlowId !== id ? state.activeFlowId : newActive });
  }, [state.activeFlowId]);

  const addModule    = useCallback(async (fid: string, d: { label: string; name: string; side: string; note: string; parallel_group?: string }) => { await api.addModule(fid, d);      await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const deleteModule = useCallback(async (id: string) => { await api.deleteModule(id);    await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const moveModule   = useCallback(async (fid: string, mid: string, dir: -1 | 1) => { await api.reorderModule(fid, mid, dir); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const addScenario  = useCallback(async (mid: string, d: { blid: string; description: string }) => { await api.addScenario(mid, d); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const updateScenario = useCallback(async (id: string, data: object) => { await api.updateScenario(id, data as any); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const deleteScenario = useCallback(async (id: string) => { await api.deleteScenario(id); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const moveScenario = useCallback(async (mid: string, sid: string, newIndex: number) => { await api.reorderScenario(mid, sid, newIndex); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const moveStep     = useCallback(async (scid: string, stid: string, newIndex: number) => { await api.reorderStep(scid, stid, newIndex); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const addStep    = useCallback(async (sid: string, d: { description: string; expected: string }) => { await api.addStep(sid, d); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const updateStep = useCallback(async (id: string, data: Partial<TestStep>) => { await api.updateStep(id, data); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const deleteStep = useCallback(async (id: string) => { await api.deleteStep(id); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const copyStep   = useCallback(async (stepId: string, targetScenarioId: string) => { await api.copyStep(stepId, targetScenarioId); await loadFlows(state.activeFlowId); }, [loadFlows, state.activeFlowId]);
  const uploadImage    = useCallback(async (file: File) => { const { url } = await api.uploadImage(file); return url; }, []);

  const activeFlow = state.flows.find(f => f.id === state.activeFlowId);

  return (
    <Ctx.Provider value={{
      state, activeFlow, loadFlows,
      setActive: id  => dispatch({ type: 'SET_ACTIVE', id }),
      setTab:    tab => dispatch({ type: 'SET_TAB',    tab }),
      toggleExpand: id => dispatch({ type: 'TOGGLE_EXPAND', id }),
      createFlow, updateFlow, deleteFlow, addModule, deleteModule, moveModule,
      addScenario, updateScenario, deleteScenario, moveScenario,
      addStep, updateStep, deleteStep, copyStep, moveStep, uploadImage,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
