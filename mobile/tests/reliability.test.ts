import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';
import { byteLength, OutputLedger } from '../src/state/output';
import { CreateRequests } from '../src/state/createRequest';
import { RpcError } from '../src/transport/RpcClient';

test('metadata events retain controller, output and known process exit evidence', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay(); await h.store.actions.claimControl!();
  h.event('terminal.output', { sessionId: 'one', output: ' new', offset: 9, generation: 'g1' });
  h.event('host.changed', {}); await delay();
  assert.equal(h.store.state.output, 'hello new'); assert.equal(h.store.state.control, 'ready');
  h.event('terminal.exit', { sessionId: 'one', exitCode: 23 });
  h.store.acceptHost({ ...structuredClone(hostState), sessions: [{ ...hostState.sessions[0], status: 'exited' }] });
  assert.equal(h.store.state.sessions[0].exitCode, 23);
  h.store.dispose();
});
test('an input acknowledgement remains accepted across immediate disconnect', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay(); await h.store.actions.claimControl!();
  h.handle(message => {
    if (message.payload?.method !== 'session.input') return false;
    h.reply(message, { accepted: true, inputId: message.payload.params.inputId });
    h.store.actions.disconnect(); return true;
  });
  await h.store.actions.sendInput('accepted\r');
  assert.equal(h.store.state.status, 'offline'); h.store.dispose();
});
test('ambiguous session creation keeps its token through persistent restoration', () => {
  const first = new CreateRequests(() => 'original');
  const key = first.key('host', 'project', 'shell', 'Task');
  assert.equal(first.begin(key), 'original'); first.failed(key, new RpcError('Disconnected', true));
  const restored = new CreateRequests(() => 'replacement'); restored.restore(first.serialize());
  assert.equal(restored.begin(key), 'original'); restored.success(key);
  assert.equal(restored.begin(key), 'replacement');
});
test('bounded output never leaves a low surrogate at the retained boundary', () => {
  const ledger = new OutputLedger('one'); const output = '🧑' + 'x'.repeat(239999);
  ledger.snapshot({ sessionId: 'one', output, offset: byteLength(output), generation: 'g1', status: 'running' });
  assert.equal(ledger.output, 'x'.repeat(239999));
});
