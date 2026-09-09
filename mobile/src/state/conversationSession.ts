import { ConversationLedger } from './conversationLedger';
import type { ConversationEvent, ConversationSnapshot } from './conversationTypes';
import type { WorkspaceStore } from './WorkspaceStore';
const resyncLedger = new WeakMap<WorkspaceStore, ConversationLedger>();
const snapshotRequests = new WeakMap<ConversationLedger, number>();

export async function loadConversation(store: WorkspaceStore, sessionId: string) {
  const session = store.state.sessions.find(item => item.id === sessionId);
  if (!session || session.runner !== 'conversation' || store.state.selectedSessionId !== sessionId) return;
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const current = () => store.current(epoch) && selected === store.selectionEpoch;
  const ledger = store.conversationLedger?.sessionId === sessionId ? store.conversationLedger
    : new ConversationLedger(sessionId, session.projectId);
  store.conversationLedger = ledger;
  const request = (snapshotRequests.get(ledger) ?? 0) + 1;
  snapshotRequests.set(ledger, request);
  const snapshot = await store.deps.rpc.request<ConversationSnapshot>('conversation.snapshot', { sessionId });
  if (!current() || snapshotRequests.get(ledger) !== request) return;
  ledger.snapshot(snapshot);
  store.update({ conversation: ledger.value, error: null,
    sessions: store.state.sessions.map(item => item.id === sessionId ? { ...item, status: ledger.value!.processState } : item) });
}
export function receiveConversation(store: WorkspaceStore, event: ConversationEvent) {
  const ledger = store.conversationLedger;
  if (!ledger || event.sessionId !== store.state.selectedSessionId) return;
  const previous = ledger.value;
  try {
    if (ledger.push(event)) store.update({ conversation: ledger.value,
      sessions: store.state.sessions.map(item => item.id === event.sessionId ? { ...item, status: event.processState } : item) });
    if (event.processState !== 'running') { store.lease = null; store.update({ control: 'readonly' }); }
    const ended = ['completed', 'interrupted', 'failed'].includes(event.turnState) && previous?.turnState !== event.turnState;
    if (ended || (previous && previous.processState !== event.processState)) refreshConversation(store, ledger, true);
  } catch (error) {
    store.lease = null; store.update({ control: 'readonly' }); store.report(error);
    refreshConversation(store, ledger);
  }
}
function refreshConversation(store: WorkspaceStore, ledger: ConversationLedger, force = false) {
  if (!force && store.conversationLoading && resyncLedger.get(store) === ledger) return;
  const epoch = store.epoch;
  resyncLedger.set(store, ledger);
  const work = loadConversation(store, ledger.sessionId)
    .catch(cause => { if (store.current(epoch) && store.conversationLedger === ledger) store.report(cause); })
    .finally(() => { if (store.conversationLoading === work) store.conversationLoading = null; });
  store.conversationLoading = work;
}
export function conversationGeneration(store: WorkspaceStore) {
  return store.state.sessions.find(item => item.id === store.state.selectedSessionId)?.runner === 'conversation'
    ? store.conversationLedger?.value?.generation : store.ledger?.generation;
}
