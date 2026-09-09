import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

test('desktop read-only sessions stream output and reject control before dispatch', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, sessions: hostState.sessions.map(session => ({ ...session, readOnly: true })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  h.event('terminal.output', { sessionId: 'one', output: ' world', offset: 11, generation: 'g1' });
  assert.equal(h.store.state.output, 'hello world');
  await assert.rejects(h.store.actions.claimControl!(), /view-only/);
  assert.equal(h.sent.some(message => message.payload?.method === 'session.claim'), false);
  await assert.rejects(h.store.actions.sendInput('unsafe'), /control/);
  assert.equal(h.sent.some(message => message.payload?.method === 'session.input'), false);
  h.store.dispose();
});
