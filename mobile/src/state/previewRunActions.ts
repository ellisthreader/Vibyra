import type { WorkspaceStore } from './WorkspaceStore';
import { ready } from './previewActions';
import { validRunApproval, validRunSummary, validRunTargetId, type RunApproval, type RunSummary } from '../preview/runnable';

function runReady(store: WorkspaceStore): number {
  const epoch = ready(store);
  if (!store.state.previewRunAvailable) throw new Error('Update Vibyra on your computer to run apps from this phone.');
  return epoch;
}

/** Running a project's desktop app. The computer asks first (an approval
 *  answer) and honours `approve` only with the command version this phone showed. */
export function previewRunActions(store: WorkspaceStore) {
  return {
    runPreview: async (projectId: string, targetId: string,
      options: { approve?: boolean; commandVersion?: string } = {}): Promise<RunApproval | RunSummary> => {
      const epoch = runReady(store);
      if (!projectId || !validRunTargetId(targetId)) throw new Error('Refresh the list of apps.');
      if (options.approve && !/^[0-9a-f]{16}$/.test(options.commandVersion ?? '')) throw new Error('Refresh the list of apps.');
      const params = options.approve
        ? { projectId, targetId, approve: true, commandVersion: options.commandVersion }
        : { projectId, targetId };
      const result = await store.deps.rpc.request<unknown>('preview.run', params, 30000);
      store.assertCurrent(epoch);
      if (validRunApproval(result) || validRunSummary(result)) return result;
      throw new Error('Your computer returned an invalid answer. Try again.');
    },
    stopPreview: async (projectId: string, targetId: string): Promise<{ phase: string }> => {
      const epoch = runReady(store);
      if (!projectId || !validRunTargetId(targetId)) throw new Error('Refresh the list of apps.');
      const result = await store.deps.rpc.request<{ phase: string }>('preview.stop', { projectId, targetId });
      store.assertCurrent(epoch);
      return result;
    },
  };
}
