import type { ScaffoldActions, ScaffoldEvent, ScaffoldPreflight, ScaffoldStatus } from '../scaffold/api';
import type { Project } from '../ui/types';
import type { WorkspaceStore } from './WorkspaceStore';

/**
 * Starting a project on the computer: the Host's `scaffold.*` methods, asked
 * over the same connection as everything else. `start` answers as soon as the
 * build begins; its progress arrives as events, read through `follow`, so no
 * request here ever waits on a package manager.
 */
export function scaffoldActions(store: WorkspaceStore): { scaffold: ScaffoldActions } {
  const request = async <T>(method: string, params: object): Promise<T> => {
    if (store.state.status !== 'connected') throw new Error('Connect your computer to start a project on it.');
    if (!store.state.scaffoldAvailable) throw new Error('Update Vibyra Host on your computer to start projects from here.');
    const epoch = store.epoch;
    const result = await store.deps.rpc.request<T>(method, params);
    store.assertCurrent(epoch);
    return result;
  };
  return { scaffold: {
    preflight: tools => request<ScaffoldPreflight>('scaffold.preflight', { tools }),
    start: async (runId, plan) => { await request('scaffold.start', { runId, plan }); },
    cancel: async runId => { await request('scaffold.cancel', { runId }); },
    status: runId => request<ScaffoldStatus>('scaffold.status', { runId }),
    adopt: async dir => {
      const result = await request<{ project: Project }>('scaffold.adopt', { dir });
      await store.refresh().catch(() => {});
      return result.project;
    },
    follow: listener => store.deps.rpc.listen(notice => {
      if (notice.type !== 'message' || store.state.status !== 'connected') return;
      const { event, data } = notice.payload ?? {};
      if (!data?.runId) return;
      const parsed = parseScaffoldEvent(event, data);
      if (parsed) listener(parsed);
    }),
  } };
}

export function parseScaffoldEvent(event: unknown, data: Record<string, unknown>): ScaffoldEvent | null {
  const runId = String(data.runId);
  if (event === 'scaffold.step') {
    return { type: 'step', runId, index: Number(data.index), total: Number(data.total), label: String(data.label ?? '') };
  }
  if (event === 'scaffold.output') {
    const lines = Array.isArray(data.lines) ? data.lines.filter((line): line is string => typeof line === 'string') : [];
    return { type: 'output', runId, lines };
  }
  if (event === 'scaffold.done') {
    const project = data.project && typeof data.project === 'object' ? data.project as Project : null;
    return { type: 'done', runId, ok: data.ok === true, message: typeof data.message === 'string' ? data.message : null,
      stalled: data.stalled === true, project };
  }
  return null;
}
