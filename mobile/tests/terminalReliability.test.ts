import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSession } from '../src/state/session';
import { InputQueue } from '../src/state/inputQueue';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

test('host changes during a terminal refresh are reconciled after its snapshot', async () => {
  const h = runtimeHarness();
  try {
    await h.store.actions.connect(JSON.stringify(pairing));
    await selectSession(h.store, 'one');
    let snapshot: any;
    let reads = 0;
    h.handle(message => {
      if (message.payload?.method === 'host.state') {
        reads++;
        h.reply(message, { ...hostState, host: { ...hostState.host,
          name: reads > 1 ? 'Updated Mac' : 'Old Mac' } });
        return true;
      }
      if (message.payload?.method !== 'session.snapshot') return false;
      snapshot = message;
      return true;
    });
    const refresh = h.store.refresh(true);
    await delay();
    assert.ok(snapshot);
    h.event('host.changed', {});
    h.reply(snapshot, { sessionId: 'one', generation: 'g1', offset: 5, output: 'hello', status: 'running' });
    await refresh;
    assert.equal(reads, 2);
    assert.equal(h.store.state.host?.name, 'Updated Mac');
  } finally { h.store.dispose(); }
});

test('buffered typing never crosses terminals, including A to B to A', async () => {
  const h = runtimeHarness();
  try {
    await h.store.actions.connect(JSON.stringify(pairing));
    await selectSession(h.store, 'one');
    let held: any;
    h.handle(message => {
      if (message.payload?.method !== 'session.input' || held) return false;
      held = message;
      return true;
    });
    const first = h.store.actions.sendInput('a');
    const buffered = h.store.actions.sendInput('DO NOT SEND\r');
    const rejected = assert.rejects(buffered, /terminal changed/i);
    const firstRejected = assert.rejects(first, /terminal changed/i);
    await delay();
    await selectSession(h.store, 'two');
    await h.store.actions.sendInput('b');
    await selectSession(h.store, 'one');
    h.reply(held, { ok: true });
    await Promise.all([rejected, firstRejected]);
    await h.store.actions.sendInput('c');
    assert.deepEqual(h.sent.filter(m => m.payload?.method === 'session.input')
      .map(m => [m.payload.params.sessionId, m.payload.params.data]),
    [['one', 'a'], ['two', 'b'], ['one', 'c']]);
  } finally { h.store.dispose(); }
});

test('empty and synchronously failed input do not wedge the queue; Unicode stays intact', async () => {
  const sent: string[] = [];
  const queue = new InputQueue(data => {
    if (data === 'fail') throw new Error('synchronous failure');
    sent.push(data);
    return Promise.resolve();
  });
  await queue.push('');
  await assert.rejects(queue.push('fail'), /synchronous/);
  const text = `${'a'.repeat(2047)}😀${'b'.repeat(2048)}`;
  await queue.push(text);
  assert.equal(sent.map(data => new TextDecoder().decode(new TextEncoder().encode(data))).join(''), text);
  assert.ok(sent.every(data => new TextEncoder().encode(data).length <= 8192));
});

test('iOS reconnect restores the exact raw terminal and acquires a fresh lease', async () => {
  const h = runtimeHarness();
  h.store.deps.iosConversations = true;
  try {
    await h.store.actions.connect(JSON.stringify(pairing));
    await selectSession(h.store, 'two');
    h.store.suspend();
    assert.equal(h.store.state.selectedSessionId, 'two');
    assert.equal(h.store.state.control, 'none');
    await h.store.actions.reconnect!();
    assert.equal(h.store.state.selectedSessionId, 'two');
    assert.equal(h.store.state.control, 'ready');
    assert.equal(h.store.state.output, 'hello');
    await h.store.actions.sendInput('ok');
    assert.equal(h.sent.at(-1).payload.params.sessionId, 'two');
  } finally { h.store.dispose(); }
});

test('a host change during refresh is read again instead of silently discarded', async () => {
  const h = runtimeHarness();
  try {
    await h.store.actions.connect(JSON.stringify(pairing));
    const reads: any[] = [];
    h.handle(message => {
      if (message.payload?.method !== 'host.state') return false;
      reads.push(message);
      return true;
    });
    const first = h.store.refresh();
    await delay();
    h.event('host.changed', {});
    h.reply(reads[0], hostState);
    await delay();
    assert.equal(reads.length, 2);
    h.reply(reads[1], { ...hostState, sessions: hostState.sessions.slice(1) });
    await first;
    assert.deepEqual(h.store.state.sessions.map(session => session.id), ['two']);
  } finally { h.store.dispose(); }
});

test('a resize refusal keeps a valid input lease; a typing revocation removes it', async () => {
  const h = runtimeHarness();
  try {
    await h.store.actions.connect(JSON.stringify(pairing));
    h.store.dimensions = [40, 30];
    h.handle(message => {
      if (message.payload?.method !== 'session.resize') return false;
      h.rpc.receive({ type: 'message', connectionId: message.connectionId,
        payload: { id: message.payload.id, ok: false, error: { message: 'Resize unavailable' } } });
      return true;
    });
    await selectSession(h.store, 'one');
    assert.equal(h.store.state.control, 'ready');
    await h.store.actions.sendInput('still works');
    h.store.acceptHost({ ...hostState, sessions: hostState.sessions.map(session => ({
      ...session, readOnly: true, canInput: false,
    })) });
    assert.equal(h.store.lease, null);
    await assert.rejects(h.store.actions.sendInput('blocked'), /control/);
  } finally { h.store.dispose(); }
});
