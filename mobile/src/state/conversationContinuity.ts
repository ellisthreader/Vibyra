import type { WorkspaceStore } from './WorkspaceStore';
import { selectSession } from './session';
const persistence = new WeakMap<WorkspaceStore, Promise<void>>();

export function cachedConversation(store: WorkspaceStore) {
  if (!store.deps.iosConversations || !store.state.conversation) return {};
  return { selectedSessionId: store.state.selectedSessionId, conversation: store.state.conversation,
    projects: store.state.projects, sessions: store.state.sessions };
}
export function rememberConversation(store: WorkspaceStore, id: string | null) {
  if (!store.deps.iosConversations || !store.state.host) return;
  const key = `selected.${store.state.host.id}`;
  const epoch = store.epoch;
  const work = (persistence.get(store) ?? Promise.resolve()).then(() =>
    id ? store.deps.flags.write(key, id) : store.deps.flags.delete(key)).catch(() => {
    if (store.current(epoch)) store.report(new Error('This chat could not be remembered on your phone.'));
  });
  persistence.set(store, work);
}
export async function restoreConversation(store: WorkspaceStore) {
  if (!store.deps.iosConversations || !store.state.host) return;
  const epoch = store.epoch; const selection = store.selectionEpoch;
  const key = `selected.${store.state.host.id}`;
  await persistence.get(store);
  if (!store.current(epoch) || store.selectionEpoch !== selection) return;
  const id = await store.deps.flags.read(key);
  if (!store.current(epoch) || store.selectionEpoch !== selection || !id) return;
  if (store.state.sessions.some(item => item.id === id && item.runner === 'conversation')) await selectSession(store, id);
}
