import type { WorkspaceStore } from './WorkspaceStore';

/** A response belongs to one connection, selection and agent generation. */
export function conversationScope(store: WorkspaceStore) {
  const conversation = store.state.conversation;
  if (
    !conversation ||
    store.state.status !== 'connected' ||
    store.state.selectedSessionId !== conversation.sessionId
  )
    throw new Error('Reconnect to load this conversation.');
  const epoch = store.epoch;
  const selection = store.selectionEpoch;
  const current = () =>
    store.current(epoch) &&
    store.selectionEpoch === selection &&
    store.state.conversation?.sessionId === conversation.sessionId &&
    store.state.conversation?.generation === conversation.generation;
  return {
    conversation,
    current,
    assertCurrent() {
      if (!current()) throw new Error('The conversation changed. Try again in the current chat.');
    },
  };
}
