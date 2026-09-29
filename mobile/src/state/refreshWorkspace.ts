import { hostSnapshot } from './hostSnapshot';
import { selectSession } from './session';
import type { WorkspaceStore } from './WorkspaceStore';

type Refresh = { epoch: number; again: boolean; terminal: boolean; work: Promise<void> };
const pending = new WeakMap<WorkspaceStore, Refresh>();

/** Coalesce notifications, retaining changes received during a snapshot read. */
export function refreshWorkspace(store: WorkspaceStore, terminal = false): Promise<void> {
  if (store.state.status !== 'connected')
    return Promise.reject(new Error('Reconnect to refresh your workspace.'));
  const existing = pending.get(store);
  if (existing?.epoch === store.epoch) {
    existing.again = true;
    existing.terminal ||= terminal;
    return existing.work;
  }
  const refresh: Refresh = {
    epoch: store.epoch,
    again: false,
    terminal,
    work: Promise.resolve(),
  };
  pending.set(store, refresh);
  refresh.work = Promise.resolve().then(async () => {
    store.assertCurrent(refresh.epoch);
    store.update({ syncing: true });
    try {
      do {
        refresh.again = false;
        const result = await hostSnapshot(store, refresh.epoch);
        store.assertCurrent(refresh.epoch);
        store.acceptHost(result);
        if (refresh.terminal && store.state.selectedSessionId) {
          refresh.terminal = false;
          await selectSession(store, store.state.selectedSessionId);
        }
      } while (refresh.again);
    } catch (error) {
      if (store.current(refresh.epoch)) store.report(error);
      throw error;
    } finally {
      if (pending.get(store) === refresh) pending.delete(store);
      if (store.current(refresh.epoch)) store.update({ syncing: false });
    }
  });
  return refresh.work;
}
