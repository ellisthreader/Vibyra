import { claimControl, typable } from './session';
import { loadConversation } from './conversationSession';
import type { WorkspaceStore } from './WorkspaceStore';

const pending = new WeakMap<WorkspaceStore, Promise<void>>();

/** Explicit Resume or Send continues the saved thread, never replays a task. */
export function resumeConversation(store: WorkspaceStore): Promise<void> {
  const existing = pending.get(store);
  if (existing) return existing;
  const work = resume(store).finally(() => { pending.delete(store); });
  pending.set(store, work);
  return work;
}

async function resume(store: WorkspaceStore) {
  const id = store.state.selectedSessionId;
  const conversation = store.state.conversation;
  if (!id || !conversation || conversation.sessionId !== id ||
      store.state.status !== 'connected' || !typable(store, id))
    throw new Error('Connect and enable phone typing before continuing this terminal.');
  if (!conversation.canResume) throw new Error('Update Vibyra Desktop to resume this saved terminal.');
  const epoch = store.epoch; const selection = store.selectionEpoch;
  const check = () => {
    if (!store.current(epoch) || store.selectionEpoch !== selection ||
        store.state.selectedSessionId !== id || store.state.status !== 'connected' || !typable(store, id))
      throw new Error('The selected terminal or its typing permission changed. Your draft is kept.');
  };
  if (conversation.processState !== 'running') {
    try {
      await store.deps.rpc.request('conversation.resume', {
        sessionId: id, projectId: conversation.projectId, generation: conversation.generation,
      });
    } finally {
      // Even a lost acknowledgement can have resumed the process. Refresh its
      // state, but do not submit a prompt after an uncertain resume response.
      check();
      await loadConversation(store, id);
      // The resumed-generation event can supersede our snapshot request. Wait
      // for that newer resync before deciding whether the process recovered.
      while (store.conversationLoading) {
        const latest = store.conversationLoading;
        await latest;
        check();
        if (store.conversationLoading === latest) break;
      }
    }
  }
  check();
  if (store.state.conversation?.processState !== 'running')
    throw new Error('The agent could not resume. Your conversation and draft are kept.');
  await claimControl(store);
  check();
}
