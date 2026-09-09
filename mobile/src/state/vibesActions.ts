import type { WorkspaceStore } from './WorkspaceStore';
import type { WorkspaceActions } from '../ui/types';

export function vibesActions(store: WorkspaceStore): Pick<WorkspaceActions, 'vibesProjectRequest'> {
  return {
    vibesProjectRequest: async (method, params) => {
      const epoch = store.epoch; const account = store.token;
      if (!account || !store.state.vibesToolsAvailable || store.state.status !== 'connected'
        || params.hostId !== store.state.host?.id || !store.state.projects.some(p => p.id === params.projectId)) {
        throw new Error('Reconnect to the authorized computer and sign in before using project tools.');
      }
      const result = await store.deps.rpc.request<Record<string, unknown>>(method, params);
      store.assertCurrent(epoch);
      if (account !== store.token) throw new Error('Your account changed. The tool result was not shared.');
      return result;
    },
  };
}
