import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationReliabilityHarness } from './conversationReliabilityHarness';
import { delay, hostState } from './runtimeHarness';

for (const loading of [false, true]) test(`an old host snapshot preserves a ${loading ? 'loading' : 'loaded'} launch`, async () => {
  const h = await conversationReliabilityHarness();
  try {
    let held: any;
    let conversationRead: any;
    const created = { ...h.store.state.sessions[0], id: 'created', title: 'New terminal' };
    h.intercept(message => {
      if (message.payload?.method === 'host.state') { held = message; return true; }
      if (message.payload?.method === 'session.create') { h.reply(message, created); return true; }
      if (loading && message.payload?.method === 'conversation.snapshot' && message.payload.params.sessionId === created.id) {
        conversationRead = message; return true;
      }
      return false;
    });
    const refresh = h.store.refresh();
    await delay();
    assert.ok(held);
    const launch = h.store.actions.createSession('project1', 'codex', 'New terminal');
    await delay();
    if (!loading) await launch;
    h.reply(held, { ...hostState, sessions: hostState.sessions });
    await refresh;
    assert.equal(h.store.state.selectedSessionId, 'created');
    if (loading) {
      assert.ok(conversationRead);
      h.reply(conversationRead, h.snapshot(created.id));
    }
    await launch;
    assert.equal(h.store.state.conversation?.sessionId, 'created');
    assert.equal(h.store.state.conversation?.settings?.model, 'account-one');
    assert.equal(h.store.state.conversation?.settings?.effort, 'high');
    assert.equal(h.store.state.control, 'ready');
    // A subsequent authoritative read can still remove a genuinely deleted session.
    const next = h.store.refresh();
    await delay();
    h.reply(held, hostState);
    await next;
    assert.equal(h.store.state.selectedSessionId, null);
  } finally { h.store.dispose(); }
});
