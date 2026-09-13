import assert from 'node:assert/strict';
import test from 'node:test';
import { rememberConversation } from '../src/state/conversationContinuity';
import { loadConversation } from '../src/state/conversationSession';
import { selectSession } from '../src/state/session';
import { delay, pairing, runtimeHarness } from './runtimeHarness';

test('selected conversation persistence serializes writes and a later terminal selection clears it', async () => {
  const h = runtimeHarness(); h.store.deps.iosConversations = true;
  await h.store.actions.connect(JSON.stringify(pairing));
  let release!: () => void;
  const started: string[] = [];
  const write = h.store.deps.flags.write;
  h.store.deps.flags.write = async (key, value) => {
    started.push(value);
    if (value === 'first') await new Promise<void>(resolve => { release = resolve; });
    await write(key, value);
  };
  rememberConversation(h.store, 'first'); rememberConversation(h.store, 'second');
  await delay(); assert.deepEqual(started, ['first']);
  release(); await delay();
  assert.deepEqual(started, ['first', 'second']); assert.equal(h.flags.get('selected.host1'), 'second');
  await selectSession(h.store, 'one'); await delay();
  assert.equal(h.flags.has('selected.host1'), false); h.store.dispose();
});

test('snapshot replay uses final process state when a queued event stops the agent', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.update({ sessions: h.store.state.sessions.map(item => ({ ...item, kind: 'codex', runner: 'conversation' })),
    selectedSessionId: 'one' });
  let request: any;
  h.handle(message => {
    if (message.payload?.method !== 'conversation.snapshot') return false;
    request = message; return true;
  });
  const loading = loadConversation(h.store, 'one'); await delay();
  h.store.conversationLedger!.push({ sessionId: 'one', projectId: 'project1', generation: 'g1', cursor: 2,
    processState: 'exited', turnState: 'failed' });
  h.reply(request, { sessionId: 'one', projectId: 'project1', generation: 'g1', cursor: 1,
    processState: 'running', turnState: 'running', items: [], pending: [], hasMore: false });
  await loading;
  assert.equal(h.store.state.conversation?.processState, 'exited');
  assert.equal(h.store.state.sessions.find(item => item.id === 'one')?.status, 'exited');
  h.store.dispose();
});

test('overlapping snapshots cannot restore an older generation or load a different selected chat', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.update({ sessions: h.store.state.sessions.map(item => ({ ...item, kind: 'codex', runner: 'conversation' })),
    selectedSessionId: 'one' });
  const requests: any[] = [];
  h.handle(message => {
    if (message.payload?.method !== 'conversation.snapshot') return false;
    requests.push(message); return true;
  });
  await loadConversation(h.store, 'two'); assert.equal(requests.length, 0);
  const first = loadConversation(h.store, 'one'); await delay();
  const second = loadConversation(h.store, 'one'); await delay();
  const snapshot = { sessionId: 'one', projectId: 'project1', cursor: 1, processState: 'running',
    turnState: 'idle', items: [], pending: [], hasMore: false };
  h.reply(requests[1], { ...snapshot, generation: 'new' }); await second;
  h.reply(requests[0], { ...snapshot, generation: 'old' }); await first;
  assert.equal(h.store.state.conversation?.generation, 'new'); h.store.dispose();
});

test('final lifecycle events refresh request states and revoke input when process exits', async () => {
  const h = runtimeHarness(); await h.store.actions.connect(JSON.stringify(pairing));
  h.store.update({ sessions: h.store.state.sessions.map(item => ({ ...item, kind: 'codex', runner: 'conversation' })),
    selectedSessionId: 'one', control: 'ready' });
  const snapshot = { sessionId: 'one', projectId: 'project1', generation: 'g1', cursor: 1,
    processState: 'running', turnState: 'waiting', items: [{ id: 'permission', turnId: 't', kind: 'permission', status: 'pending' }],
    pending: [], hasMore: false };
  let loads = 0;
  h.handle(message => {
    if (message.payload?.method !== 'conversation.snapshot') return false;
    loads++;
    h.reply(message, loads === 1 ? snapshot : { ...snapshot, cursor: 2, processState: 'exited', turnState: 'failed',
      items: [{ ...snapshot.items[0], status: 'expired' }] });
    return true;
  });
  await loadConversation(h.store, 'one');
  h.store.lease = { sessionId: 'one', generation: 'g1', lease: 'lease' };
  h.event('conversation.updated', { ...snapshot, cursor: 2, processState: 'exited', turnState: 'failed' });
  await delay();
  assert.equal(loads, 2); assert.equal(h.store.lease, null); assert.equal(h.store.state.control, 'readonly');
  assert.equal(h.store.state.conversation?.items[0].status, 'expired'); h.store.dispose();
});
