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

test('a Mac with typing on starts a terminal in its own grid when asked, and closes one', async () => {
  const h = runtimeHarness();
  const created = { id: 'g1-9', projectId: 'project1', title: 'From the phone', kind: 'shell', status: 'running',
    createdAt: '1970-01-01T00:00:00Z', readOnly: true, canInput: true };
  h.handle(message => {
    const method = message.payload?.method;
    if (method === 'host.state') {
      h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: true, canManage: true },
        sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: true })) });
    } else if (method === 'session.create') h.reply(message, created);
    else if (method === 'session.stop') h.reply(message, { ok: true });
    else return false;
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  // Still a watched Mac in every other way; only starting and closing are added.
  assert.equal(h.store.state.viewOnly, true);
  assert.equal(h.store.state.canManage, true);
  await h.store.actions.createSession('project1', 'shell', 'From the phone');
  assert.ok(h.store.state.sessions.some(session => session.id === 'g1-9'), 'the Mac\'s answer is listed at once');
  const create = h.sent.find(message => message.payload?.method === 'session.create')?.payload.params;
  assert.equal(create.projectId, 'project1');
  assert.equal(create.kind, 'shell');
  assert.equal(create.title, 'From the phone');
  assert.ok(create.requestId, 'a retry can be told from a second start');
  assert.equal(h.store.state.selectedSessionId, 'g1-9', 'the new terminal opens');
  await h.store.actions.stopSession('one');
  assert.deepEqual(h.sent.find(message => message.payload?.method === 'session.stop')?.payload.params, { sessionId: 'one' });
  h.store.dispose();
});

test('a Mac that never said it can start terminals is not asked to', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...hostState, capabilities: { readOnly: true, canInput: true },
      sessions: hostState.sessions.map(session => ({ ...session, readOnly: true, canInput: true })) });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.canManage, false);
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

test('a watching phone draws the Mac pane at the Mac grid and never sets its width', async () => {
  const h = runtimeHarness();
  viewOnlyHost(h);
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  assert.equal(h.store.state.control, 'readonly');
  // The Mac's snapshot names the grid it draws for, and that is the grid drawn here.
  assert.equal(h.store.state.hostGrid, null, 'this harness snapshot names no grid; a real Mac does');
  await h.store.actions.resize(52, 30); await delay();
  h.store.actions.selectSession('two'); await delay();
  assert.deepEqual(resizes(h), [], 'a Mac pane is the one the person is working in; the phone leaves its width alone');
  h.store.dispose();
});

test('a computer that grants control is taken on opening, and resized under that lease', async () => {
  const h = runtimeHarness();
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  assert.equal(h.store.state.control, 'ready');
  await h.store.actions.resize(52, 30); await delay();
  // Never a lease-less resize on a Host: that is a request it rejects.
  assert.deepEqual(resizes(h), [{ sessionId: 'one', lease: 'lease1', generation: 'g1', cols: 52, rows: 30 }]);
  h.store.dispose();
});

test('a phone whose terminal another phone took goes back to watching, so a tap can take it again', async () => {
  const h = runtimeHarness();
  let taken = false;
  h.handle(message => {
    if (message.payload?.method !== 'session.input' || !taken) return false;
    h.rpc.receive({ type: 'message', connectionId: message.connectionId, payload: { id: message.payload.id, ok: false,
      error: { message: 'Another phone took this terminal. Tap it to type here again.' } } });
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  h.store.actions.selectSession('one'); await delay();
  assert.equal(h.store.state.control, 'ready');
  await h.store.actions.sendInput('a');
  taken = true;
  await assert.rejects(h.store.actions.sendInput('b'), /Another phone took this terminal/);
  assert.equal(h.store.state.control, 'readonly', 'the lost lease is not kept');
  await assert.rejects(h.store.actions.sendInput('c'), /Take control of this session/);
  // The same claim takes it back; that is what a tap on the terminal does.
  await h.store.actions.claimControl!();
  assert.equal(h.store.state.control, 'ready');
  h.store.dispose();
});
