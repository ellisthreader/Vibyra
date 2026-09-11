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

test('a computer that allows typing gets a text box; one that does not, never does', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: true },
      sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: true })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  // `readOnly` keeps its own meaning — no browsing, no stopping — so both are true.
  assert.equal(h.store.state.viewOnly, true);
  assert.equal(h.store.state.canType, true);
  h.store.actions.selectSession('one'); await delay();
  await h.store.actions.claimControl!();
  assert.equal(h.store.state.control, 'ready');
  await h.store.actions.sendInput('echo typed\r');
  assert.ok(h.sent.some(message => message.payload?.method === 'session.input'));
  h.store.dispose();
});

test('a computer that predates the switch is never offered a box that would error', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    // No `canInput` anywhere: the field is simply absent, as on an older Mac.
    h.reply(message, { ...hostState, capabilities: { readOnly: true },
      sessions: hostState.sessions.map(session => ({ ...session, readOnly: true })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.canType, false);
  h.store.actions.selectSession('one'); await delay();
  await assert.rejects(h.store.actions.claimControl!(), /view-only/);
  assert.equal(h.sent.some(message => message.payload?.method === 'session.claim'), false);
  h.store.dispose();
});

test('a Mac with typing switched off says where the switch is, and is never sent a claim', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: false },
      sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: false })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.canType, false);
  h.store.actions.selectSession('one'); await delay();
  await assert.rejects(h.store.actions.claimControl!(), /Settings > iPhone connection/);
  assert.equal(h.sent.some(message => message.payload?.method === 'session.claim'), false);
  h.store.dispose();
});

test('a resync keeps the terminal on screen instead of blanking it', async () => {
  const h = runtimeHarness();
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  assert.equal(h.store.state.output, 'hello');
  let pending: any;
  h.handle(message => { if (message.payload?.method !== 'session.snapshot') return false; pending = message; return true; });
  h.event('terminal.resync', { sessionId: 'one', generation: 'g1' });
  await delay();
  // Routing this through selectSession cleared `output` first, so a busy agent
  // blanked the phone several times a second and threw the scrollback away.
  assert.equal(h.store.state.output, 'hello');
  assert.equal(h.store.state.selectedSessionId, 'one');
  assert.equal(h.store.state.error, null);
  h.reply(pending, { sessionId: 'one', output: 'hello again', offset: 11, generation: 'g1', status: 'running' });
  await delay();
  assert.equal(h.store.state.output, 'hello again');
  h.store.dispose();
});

const viewOnlyHost = (h: ReturnType<typeof runtimeHarness>) => h.handle(message => {
  if (message.payload?.method !== 'host.state') return false;
  h.reply(message, { ...hostState, capabilities: { readOnly: true },
    sessions: hostState.sessions.map(session => ({ ...session, readOnly: true })) });
  return true;
});
const resizes = (h: ReturnType<typeof runtimeHarness>) =>
  h.sent.filter(message => message.payload?.method === 'session.resize').map(message => message.payload.params);

test('a watching phone sets the width, so the computer lays out for the screen reading it', async () => {
  const h = runtimeHarness();
  viewOnlyHost(h);
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  // Control is the one thing this connection will never grant, and the grid
  // used to be reported only once it had been granted — so a phone showing a
  // Mac terminal left the program laying out for the Mac's width and every
  // line wrapped three times here.
  assert.equal(h.store.state.control, 'readonly');
  await h.store.actions.resize(52, 30); await delay();
  assert.deepEqual(resizes(h), [{ sessionId: 'one', cols: 52, rows: 30 }]);
  h.store.dispose();
});

test('opening a second terminal at the same size still hands it the phone grid', async () => {
  const h = runtimeHarness();
  viewOnlyHost(h);
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  await h.store.actions.resize(52, 30); await delay();
  h.store.actions.selectSession('two'); await delay();
  // xterm reports a grid only when it just changed one, so nothing on the
  // phone would speak up for a session opened at the size the last one used.
  assert.deepEqual(resizes(h), [
    { sessionId: 'one', cols: 52, rows: 30 },
    { sessionId: 'two', cols: 52, rows: 30 },
  ]);
  h.store.dispose();
});

test('a computer that grants control is still only resized under its lease', async () => {
  const h = runtimeHarness();
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  // Not view-only, and not claimed: a lease-less resize here is a request the
  // Host rejects, so the phone holds the size until it has control.
  await h.store.actions.resize(52, 30); await delay();
  assert.deepEqual(resizes(h), []);
  await h.store.actions.claimControl!(); await delay();
  assert.deepEqual(resizes(h), [{ sessionId: 'one', lease: 'lease1', generation: 'g1', cols: 52, rows: 30 }]);
  h.store.dispose();
});
