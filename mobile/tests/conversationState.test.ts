import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationLedger } from '../src/state/conversationLedger';
import { presentConversation } from '../src/state/presentConversation';
import type { ConversationSnapshot } from '../src/state/conversationTypes';
import { hostState, pairing, runtimeHarness, delay } from './runtimeHarness';

const snapshot = (cursor = 1): ConversationSnapshot => ({ sessionId: 'one', projectId: 'project1', generation: 'g1', cursor,
  processState: 'running', turnState: 'idle', hasMore: false, items: [{ id: 'm1', turnId: 't1', order: 1,
    kind: 'message', role: 'assistant', text: 'Hello', status: 'completed' }] });
test('conversation snapshot reconciles queued events and never rolls back live updates', () => {
  const ledger = new ConversationLedger('one', 'project1');
  ledger.push({ ...snapshot(2), item: { id: 'm1', turnId: 't1', order: 1, kind: 'message', text: 'Updated', status: 'completed' } });
  ledger.snapshot(snapshot());
  assert.equal(ledger.value?.cursor, 2); assert.equal(ledger.value?.items[0]?.text, 'Updated');
  ledger.snapshot(snapshot());
  assert.equal(ledger.value?.cursor, 2); assert.equal(ledger.value?.items[0]?.text, 'Updated');
  assert.equal(ledger.push({ ...snapshot(3), sessionId: 'two' }), false);
  assert.throws(() => ledger.push({ ...snapshot(3), generation: 'g2' }), /restarted/);
});
test('conversation gaps require resync; older history preserves live values and stable order', () => {
  const ledger = new ConversationLedger('one', 'project1'); ledger.snapshot(snapshot());
  assert.throws(() => ledger.push({ ...snapshot(3) }), /Catching up/);
  ledger.snapshot(snapshot(3)); assert.equal(ledger.value?.cursor, 3);
  ledger.prepend({ ...snapshot(), items: [{ ...snapshot().items[0]!, text: 'Stale' },
    { id: 'older', turnId: 'old-turn', order: 0, kind: 'message', text: 'Earlier', status: 'completed' }] });
  assert.deepEqual(ledger.value?.items.map(item => item.text), ['Earlier', 'Hello']);
});
test('presentation never invents completed results or freeform answer support', () => {
  assert.deepEqual(presentConversation([{ id: 'r', turnId: 't', kind: 'result', status: 'unknown' }]), []);
  const [question] = presentConversation([{ id: 'q', turnId: 't', kind: 'question', status: 'pending',
    questions: [{ id: 'choice', question: 'Pick one', options: [{ label: 'A' }], isOther: false }] }]);
  assert.equal(question?.kind, 'question');
  if (question?.kind === 'question') assert.equal(question.questions[0]?.allowFreeform, false);
});
async function structured() {
  const h = runtimeHarness(); h.store.deps.iosConversations = true;
  let turnRequests = 0; let submitStatus = 'accepted';
  h.handle(message => {
    if (message.type !== 'send') return false;
    const { method, params } = message.payload;
    if (method === 'host.state') {
      h.reply(message, { ...hostState, capabilities: { conversationV1: true },
        sessions: hostState.sessions.map(item => ({ ...item, kind: 'codex', runner: 'conversation' })) }); return true;
    }
    if (method === 'conversation.snapshot') { h.reply(message, { ...snapshot(), sessionId: params.sessionId }); return true; }
    if (method === 'turn.submit') { turnRequests++; h.reply(message, { status: submitStatus, submissionId: params.submissionId }); return true; }
    return false;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay(); await h.store.actions.claimControl!();
  return { ...h, count: () => turnRequests, unknown: () => { submitStatus = 'unknown'; } };
}
test('structured prompts use the active lease and acknowledgements, never terminal input', async () => {
  const h = await structured();
  await h.store.actions.submitTurn!('Hello');
  assert.equal(h.count(), 1);
  const request = h.sent.find(item => item.payload?.method === 'turn.submit').payload.params;
  assert.equal(request.lease, 'lease1'); assert.equal(request.generation, 'g1'); assert.equal(request.projectId, 'project1');
  assert.equal(h.sent.some(item => item.payload?.method === 'session.input'), false);
  assert.equal(h.memory.has('turn.host1.one'), false); h.store.dispose();
});
test('unknown prompt delivery retains its receipt and refuses a duplicate submission', async () => {
  const h = await structured(); h.unknown();
  await assert.rejects(h.store.actions.submitTurn!('Build'), /uncertain/);
  assert.equal(h.memory.has('turn.host1.one'), true);
  await assert.rejects(h.store.actions.submitTurn!('Build'), /uncertain/);
  assert.equal(h.count(), 1); h.store.dispose();
});
test('iOS disconnect keeps last-known conversation, drops control and cannot send', async () => {
  const h = await structured(); h.store.suspend();
  assert.equal(h.store.state.selectedSessionId, 'one'); assert.equal(h.store.state.conversation?.items[0]?.text, 'Hello');
  assert.equal(h.store.state.control, 'none');
  await assert.rejects(h.store.actions.submitTurn!('No'), /control/);
  h.store.dispose();
});
test('a provider-accepted prompt stays accepted when local receipt cleanup fails', async () => {
  const h = await structured();
  h.store.deps.storage.delete = async () => { throw new Error('storage unavailable'); };
  await h.store.actions.submitTurn!('Hello');
  assert.equal(h.count(), 1); assert.equal(h.memory.has('turn.host1.one'), true);
  h.store.dispose();
});
