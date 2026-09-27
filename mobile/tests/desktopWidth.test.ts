import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

// A Vibyra Desktop and the phone's width: the Mac keeps its own grid, the
// phone draws it, and nothing the phone does resizes the pane on the Mac.
const viewOnlyHost = (h: ReturnType<typeof runtimeHarness>) => h.handle(message => {
  if (message.payload?.method !== 'host.state') return false;
  h.reply(message, { ...hostState, capabilities: { readOnly: true },
    sessions: hostState.sessions.map(session => ({ ...session, readOnly: true })) });
  return true;
});
const resizes = (h: ReturnType<typeof runtimeHarness>) =>
  h.sent.filter(message => message.payload?.method === 'session.resize').map(message => message.payload.params);

test('a phone another phone beat to the terminal watches, and never sends the Mac a width', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method === 'host.state') {
      h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: true },
        sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: true })) });
      return true;
    }
    if (message.payload?.method !== 'session.claim') return false;
    h.rpc.receive({ type: 'message', connectionId: message.connectionId,
      payload: { id: message.payload.id, ok: false, error: { message: 'Another phone is typing in this terminal.' } } });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  // Opening tried, was refused, and the session is still on screen to read.
  assert.equal(h.store.state.control, 'readonly');
  assert.equal(h.store.state.selectedSessionId, 'one');
  assert.equal(h.store.state.error, null);
  await h.store.actions.resize(52, 30); await delay();
  assert.deepEqual(resizes(h), []);
  h.store.dispose();
});

test('a phone that may type in a Mac pane still leaves the pane its own width', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: true },
      sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: true })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  // Taken on opening, and typing works — but the pane on the Mac is the one
  // the person is working in, and shrinking it to the phone broke their display.
  assert.equal(h.store.state.control, 'ready');
  await h.store.actions.resize(46, 38); await delay();
  assert.deepEqual(resizes(h), []);
  assert.equal(h.store.state.error, null);
  h.store.dispose();
});

test('the Mac changing its own grid under an open terminal is drawn at the new grid', async () => {
  const h = runtimeHarness();
  viewOnlyHost(h);
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  await h.store.actions.resize(46, 38); await delay();
  h.event('terminal.size', { sessionId: 'one', generation: 'g1', cols: 158, rows: 42 }); await delay();
  assert.deepEqual(h.store.state.hostGrid, { cols: 158, rows: 42 });
  h.event('terminal.size', { sessionId: 'one', generation: 'g1', cols: 120, rows: 40 }); await delay();
  assert.deepEqual(h.store.state.hostGrid, { cols: 120, rows: 40 });
  assert.deepEqual(resizes(h), [], 'the phone never answers a Mac resize with its own');
  h.store.dispose();
});
