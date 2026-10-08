import { useState, useSyncExternalStore } from 'react';
import { useRuntimeLifecycle } from './useRuntimeLifecycle';
import { CloudRuntimeStore } from '../../../../mobile/src/agents/v2/cloudRuntimeStore';
import { cloudAgentClient } from '../../../../mobile/src/agents/v2/cloudRuntimeClient';
import { teammateApi } from './api';
export function useAgentRuntime(identity: string, agentId: string, enabled: boolean) {
  const [store] = useState(() => {
    const key = `agent-runtime.${encodeURIComponent(identity)}.${agentId}`;
    let target: 'local' | 'cloud' | undefined;
    try { const saved = localStorage.getItem(key); target = saved === null || saved === 'local' ? 'local' : saved === 'cloud' ? 'cloud' : undefined; } catch { /* Fail closed. */ }
    return new CloudRuntimeStore(cloudAgentClient(teammateApi), crypto.randomUUID(), target, value => localStorage.setItem(key, value));
  });
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useRuntimeLifecycle(store, enabled);
  let problem: string | null = null;
  try { if (enabled) store.runtimeId(); } catch (e) { problem = e instanceof Error ? e.message : 'Refresh the runtime.'; }
  return { store, state, problem };
}
