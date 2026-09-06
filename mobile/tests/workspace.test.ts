import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

test('enrollment stores only local identity, maps host approval copy and marks current device', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.status, 'connected');
  assert.equal(h.store.state.approvals[0].detail, 'Exact host action');
  assert.equal(h.store.state.devices[0].current, true);
  const persisted = JSON.parse(h.memory.get('connection')!);
  assert.equal(persisted.pairing.invite, undefined);
  assert.equal(persisted.privateKey.length, 64);
  h.store.dispose();
});
test('saved identity restores offline and reconnect is explicit', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.disconnect(); const count = h.sent.filter(item => item.type === 'open').length;
  await h.store.initialize();
  assert.equal(h.store.state.status, 'offline');
  assert.equal(h.sent.filter(item => item.type === 'open').length, count);
  await h.store.actions.reconnect!();
  assert.equal(h.store.state.status, 'connected');
  assert.equal(h.sent.filter(item => item.type === 'open').at(-1).pairing.invite, undefined);
  h.store.dispose();
});
test('events before snapshot reconcile and input includes active control generation', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  let snapshot: any;
  h.handle(message => { if (message.payload?.method !== 'session.snapshot') return false; snapshot = message; return true; });
  h.store.actions.selectSession('one'); await delay();
  await assert.rejects(h.store.actions.sendInput('unsafe'), /control/);
  h.event('terminal.output', { sessionId: 'one', output: ' world', offset: 11, generation: 'g1' });
  h.reply(snapshot, { sessionId: 'one', output: 'hello', offset: 5, generation: 'g1', status: 'running' });
  await delay();
  assert.equal(h.store.state.output, 'hello world'); assert.equal(h.store.state.control, 'readonly');
  await h.store.actions.claimControl!();
  assert.equal(h.store.state.control, 'ready');
  await h.store.actions.sendInput('safe\r');
  const input = h.sent.find(item => item.payload?.method === 'session.input').payload.params;
  assert.equal(input.lease, 'lease1'); assert.equal(input.generation, 'g1'); assert.equal(input.sessionId, 'one');
  assert.ok(input.inputId);
  h.store.dispose();
});
test('switching sessions ignores late snapshots and releases the previous controller', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  let held: any;
  h.handle(message => { if (message.payload?.method !== 'session.snapshot' || message.payload.params.sessionId !== 'one') return false;
    held = message; return true; });
  h.store.actions.selectSession('one'); await delay();
  h.store.actions.selectSession('two'); await delay();
  h.reply(held, { sessionId: 'one', output: 'wrong session', offset: 13, generation: 'g1', status: 'running' });
  await delay(); assert.equal(h.store.state.selectedSessionId, 'two'); assert.equal(h.store.state.output, 'hello');
  await h.store.actions.claimControl!();
  h.store.actions.selectSession(null); await delay();
  assert.ok(h.sent.some(item => item.payload?.method === 'session.release' && item.payload.params.sessionId === 'two'));
  h.store.dispose();
});
test('suspension and forgetting erase visible workspace without stopping host processes', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay(); h.store.suspend();
  assert.equal(h.store.state.status, 'offline'); assert.equal(h.store.state.output, '');
  assert.deepEqual(h.store.state.sessions, []); assert.equal(h.store.state.selectedSessionId, null);
  assert.ok(h.store.saved); assert.equal(h.sent.some(item => item.payload?.method === 'session.stop'), false);
  await h.store.actions.forgetDevice!(); assert.equal(h.store.state.host, null); assert.equal(h.memory.has('connection'), false);
  h.store.dispose();
});
test('a host identity mismatch never becomes a connected workspace', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, host: { ...hostState.host, id: 'different-host' } }); return true;
  });
  await assert.rejects(h.store.actions.connect(JSON.stringify(pairing)), /unsupported workspace/);
  assert.equal(h.store.state.status, 'error'); assert.deepEqual(h.store.state.projects, []);
  h.store.dispose();
});
