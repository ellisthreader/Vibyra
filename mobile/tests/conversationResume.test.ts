import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationReliabilityHarness } from './conversationReliabilityHarness';
import { loadConversation } from '../src/state/conversationSession';
import { selectSession } from '../src/state/session';
import { RpcError } from '../src/transport/RpcClient';

async function stopped() {
  const h = await conversationReliabilityHarness();
  let running = false; let resumes = 0; let submits = 0;
  let onResume: (() => void) | undefined;
  h.intercept(message => {
    const { method, params } = message.payload ?? {};
    if (method === 'conversation.snapshot') {
      h.reply(message, { ...h.snapshot(params.sessionId), canResume: true,
        processState: running ? 'running' : 'interrupted', generation: running ? 'g2' : 'g1' }); return true;
    }
    if (method === 'conversation.resume') {
      resumes++; assert.equal(params.sessionId, 'one'); assert.equal(params.projectId, 'project1');
      assert.equal(params.generation, 'g1'); running = true; onResume?.(); h.reply(message, { ok: true }); return true;
    }
    if (method === 'session.claim') { h.reply(message, { lease: 'new-lease', generation: 'g2' }); return true; }
    if (method === 'turn.submit') {
      submits++; assert.equal(params.generation, 'g2'); assert.equal(params.lease, 'new-lease');
      h.reply(message, { status: 'accepted' }); return true;
    }
    return false;
  });
  await loadConversation(h.store, 'one');
  return { ...h, counts: () => [resumes, submits], onResume: (fn: () => void) => { onResume = fn; } };
}

test('Send resumes the same stopped terminal, claims its new generation and sends once', async () => {
  const h = await stopped();
  try {
    assert.equal(h.store.state.control, 'readonly');
    await h.store.actions.submitTurn!('Continue here');
    assert.deepEqual(h.counts(), [1, 1]);
    assert.equal(h.store.state.selectedSessionId, 'one');
    assert.equal(h.sent.some(message => message.payload?.method === 'session.create'), false);
    assert.equal(h.memory.has('turn.host1.one'), false);
  } finally { h.store.dispose(); }
});
test('explicit Resume restores the process without sending a task, duplicate taps share work', async () => {
  const h = await stopped();
  try {
    await Promise.all([h.store.actions.resumeConversation!(), h.store.actions.resumeConversation!()]);
    assert.deepEqual(h.counts(), [1, 0]);
    assert.equal(h.store.state.control, 'ready');
  } finally { h.store.dispose(); }
});
test('lost resume acknowledgement refreshes history but never submits the draft', async () => {
  const h = await stopped();
  try {
    const request = h.store.deps.rpc.request.bind(h.store.deps.rpc);
    h.store.deps.rpc.request = async (method, params) => {
      const result = await request(method, params);
      if (method === 'conversation.resume') throw new RpcError('Resume acknowledgement lost', true);
      return result as never;
    };
    await assert.rejects(h.store.actions.submitTurn!('Keep this draft'), /acknowledgement lost/);
    assert.deepEqual(h.counts(), [1, 0]);
    assert.equal(h.store.state.conversation?.generation, 'g2');
    assert.equal(h.memory.has('turn.host1.one'), false);
  } finally { h.store.dispose(); }
});
for (const scenario of ['offline', 'typing-off', 'selection-change', 'revoked-during-resume']) {
  test(`resume refuses ${scenario} without sending the draft`, async () => {
    const h = await stopped();
    try {
      const revoke = () => h.store.update({ sessions: h.store.state.sessions.map(session => ({ ...session, canInput: false })) });
      if (scenario === 'offline') h.store.suspend();
      if (scenario === 'typing-off') revoke();
      if (scenario === 'selection-change') h.onResume(() => { void selectSession(h.store, 'two'); });
      if (scenario === 'revoked-during-resume') h.onResume(revoke);
      await assert.rejects(h.store.actions.submitTurn!('Keep this draft'));
      assert.equal(h.counts()[1], 0);
      if (scenario === 'offline' || scenario === 'typing-off') assert.equal(h.counts()[0], 0);
    } finally { h.store.dispose(); }
  });
}

test('resume waits for an event resync that supersedes its own snapshot', async () => {
  const h = await stopped();
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const request = h.store.deps.rpc.request.bind(h.store.deps.rpc);
    let snapshots = 0;
    h.store.deps.rpc.request = async (method, params) => {
      if (method === 'conversation.snapshot') {
        snapshots++;
        if (snapshots === 1) {
          const newer = loadConversation(h.store, 'one').finally(() => {
            if (h.store.conversationLoading === newer) h.store.conversationLoading = null;
          });
          h.store.conversationLoading = newer;
        } else if (snapshots === 2) await gate;
      }
      return await request(method, params) as never;
    };
    let settled = false;
    const resumed = h.store.actions.resumeConversation!().finally(() => { settled = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    release();
    await resumed;
    assert.equal(h.store.state.control, 'ready');
    assert.deepEqual(h.counts(), [1, 0]);
  } finally { h.store.dispose(); }
});
