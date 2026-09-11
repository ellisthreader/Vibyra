import { RpcError } from '../transport/RpcClient';
import { requireLease } from './session';
import { loadConversation } from './conversationSession';
import type { WorkspaceStore } from './WorkspaceStore';

export function conversationActions(store: WorkspaceStore) {
  const busy = new Set<string>();
  const context = () => {
    const lease = requireLease(store); const conversation = store.state.conversation;
    if (!conversation || conversation.sessionId !== lease.sessionId) throw new Error('Load this conversation first.');
    return { ...lease, projectId: conversation.projectId };
  };
  const exclusive = async (key: string, work: () => Promise<void>) => {
    if (busy.has(key)) throw new Error('Your response is already being sent.');
    busy.add(key); try { await work(); } finally { busy.delete(key); }
  };
  const respond = (itemId: string, decision?: 'accept' | 'decline', answers?: Record<string, string[]>) =>
    exclusive(itemId, async () => {
      const identity = context(); const epoch = store.epoch;
      const item = store.state.conversation?.items.find(item => item.id === itemId);
      if (!item?.requestId || !item.actionVersion || item.status !== 'pending') throw new Error('This request is no longer waiting for an answer.');
      const method = decision ? 'decision.resolve' : 'question.answer';
      if ((decision && item.kind !== 'permission') || (!decision && item.kind !== 'question')) throw new Error('This response does not match the request.');
      const receiptKey = `decision.${store.state.host!.id}.${identity.sessionId}.${item.requestId}`;
      const decisionId = await store.deps.storage.read(receiptKey) ?? store.deps.uuid();
      await store.deps.storage.write(receiptKey, decisionId); store.assertCurrent(epoch);
      // Recheck the lease after persistence: selection/control can change while awaiting storage.
      const latest = context();
      if (latest.sessionId !== identity.sessionId || latest.generation !== identity.generation || latest.lease !== identity.lease) {
        throw new Error('Control changed before your response was sent.');
      }
      try {
        await store.deps.rpc.request(method, { ...identity, turnId: item.turnId, requestId: item.requestId,
          actionVersion: item.actionVersion, decisionId, ...(decision ? { decision } : {
            answers: Object.fromEntries(Object.entries(answers ?? {}).map(([id, value]) => [id, { answers: value }])) }) });
      } catch (error) {
        if (error instanceof RpcError && error.uncertain && store.current(epoch)) {
          store.update({ error: 'Checking your response… Reconnect before answering again.' });
        }
        throw error;
      } finally {
        if (store.current(epoch) && store.state.status === 'connected' && store.state.selectedSessionId === identity.sessionId) {
          await loadConversation(store, identity.sessionId).catch(error => store.report(error));
        }
      }
    });
  return {
    loadEarlierConversation: () => exclusive('history', async () => {
      const conversation = store.state.conversation;
      if (!conversation || !conversation.hasMore || store.state.status !== 'connected') return;
      const epoch = store.epoch; const selection = store.selectionEpoch;
      const beforeCursor = Math.min(...conversation.items.map(item => item.order ?? item.cursor ?? Infinity));
      const page = await store.deps.rpc.request('conversation.snapshot', { sessionId: conversation.sessionId, beforeCursor });
      if (!store.current(epoch) || store.selectionEpoch !== selection) return;
      store.conversationLedger?.prepend(page); store.update({ conversation: store.conversationLedger?.value });
    }),
    submitTurn: (text: string) => exclusive('submit', async () => {
      const identity = context(); const epoch = store.epoch;
      if (!text.trim() || new TextEncoder().encode(text).length > 8192) throw new Error('Use a prompt under 8 KB. Your draft is kept.');
      if (['running', 'waiting'].includes(store.state.conversation!.turnState)) throw new Error('Wait for this task or stop it before sending another.');
      const key = `turn.${store.state.host!.id}.${identity.sessionId}`;
      const previous = await store.deps.storage.read(key); store.assertCurrent(epoch);
      if (previous) {
        const result = await store.deps.rpc.request('turn.submissionStatus', { sessionId: identity.sessionId, submissionId: previous });
        store.assertCurrent(epoch);
        if (result.status === 'accepted') {
          await store.deps.storage.delete(key); await loadConversation(store, identity.sessionId);
          throw new Error('Your previous prompt was delivered. Review it above before sending another.');
        }
        if (result.status === 'notFound' || result.status === 'failed') await store.deps.storage.delete(key);
        else throw new Error('The previous prompt delivery is still uncertain. Start a new chat rather than repeating this action.');
      }
      const submissionId = store.deps.uuid();
      await store.deps.storage.write(key, submissionId); store.assertCurrent(epoch);
      try {
        const latest = context();
        if (latest.sessionId !== identity.sessionId || latest.generation !== identity.generation || latest.lease !== identity.lease) {
          throw new Error('Control changed before your prompt was sent.');
        }
        const result = await store.deps.rpc.request('turn.submit', { ...identity, submissionId, text });
        if (result.status === 'failed') throw new RpcError(result.message ?? 'The agent could not start this task. Your draft is kept.', false);
        if (result.status !== 'accepted') throw new RpcError('Your prompt delivery is uncertain. Check this conversation before sending again.', true);
        await store.deps.storage.delete(key).catch(() => {
          if (store.current(epoch)) store.report(new Error('Your prompt was sent. Its local receipt will be reconciled next time.'));
        });
      } catch (error) {
        if (!(error instanceof RpcError) || !error.uncertain) await store.deps.storage.delete(key);
        throw error;
      }
      if (store.current(epoch) && store.state.selectedSessionId === identity.sessionId) {
        await loadConversation(store, identity.sessionId).catch(error => store.report(error));
      }
    }),
    interruptTurn: () => exclusive('interrupt', async () => {
      const identity = context(); const turnId = store.state.conversation?.turnId;
      if (!turnId) return;
      await store.deps.rpc.request('turn.interrupt', { ...identity, turnId });
    }),
    resolveDecision: (id: string, decision: 'accept' | 'decline') => respond(id, decision),
    answerQuestion: (id: string, answers: Record<string, string[]>) => respond(id, undefined, answers),
  };
}
