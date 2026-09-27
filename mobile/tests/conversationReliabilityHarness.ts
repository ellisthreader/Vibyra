import type { ConversationSnapshot } from '../src/state/conversationTypes';
import { selectSession } from '../src/state/session';
import { hostState, pairing, runtimeHarness } from './runtimeHarness';

export async function conversationReliabilityHarness() {
  const h = runtimeHarness();
  h.store.deps.iosConversations = true;
  let interceptor: ((message: any) => boolean) | undefined;
  const settings = { provider: 'codex', model: 'account-one', effort: 'high',
    revision: 7, approvalPolicy: 'on-request', appliesTo: 'nextTurn' };
  const snapshot = (sessionId = 'one', cursor = 1): ConversationSnapshot => ({
    sessionId, projectId: 'project1', generation: 'g1', cursor, settings: { ...settings },
    processState: 'running', turnState: 'idle', items: [], pending: [], hasMore: false,
  });
  h.handle(message => {
    if (interceptor?.(message)) return true;
    const { method, params } = message.payload ?? {};
    if (method === 'host.state') {
      h.reply(message, { ...hostState, capabilities: { conversationV1: true },
        sessions: hostState.sessions.map(session => ({ ...session, kind: 'codex', runner: 'conversation' })) });
      return true;
    }
    if (method === 'conversation.snapshot') {
      h.reply(message, snapshot(params.sessionId));
      return true;
    }
    if (method === 'conversation.settings') {
      Object.assign(settings, { model: params.model, effort: params.effort, revision: params.revision + 1 });
      h.reply(message, { ...settings });
      return true;
    }
    return false;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  await selectSession(h.store, 'one');
  return { ...h, settings, snapshot, intercept: (callback?: typeof interceptor) => { interceptor = callback; } };
}
