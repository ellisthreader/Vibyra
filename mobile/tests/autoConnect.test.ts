import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, pairing, runtimeHarness, type HarnessOptions } from './runtimeHarness';
import type { WorkspaceStore } from '../src/state/WorkspaceStore';

const RETRY_DELAYS = [2, 2, 2];
const opens = (sent: any[]) => sent.filter(item => item.type === 'open').length;
async function until(check: () => boolean, ms = 400) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await delay(1);
  return check();
}
/** Mounts a second app over the storage the first one left, which is what
 *  relaunching the app actually is: same phone, same saved computer, new store. */
async function relaunch(previous: { memory: Map<string, string>; flags: Map<string, string>; store: WorkspaceStore },
  options: HarnessOptions = {}) {
  previous.store.dispose();
  const next = runtimeHarness({ memory: previous.memory, flags: previous.flags, retryDelays: RETRY_DELAYS, ...options });
  await next.store.initialize();
  return next;
}
async function connected(options: HarnessOptions = {}) {
  const h = runtimeHarness({ retryDelays: RETRY_DELAYS, ...options });
  await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.status, 'connected');
  return h;
}

test('reopening the app connects the saved computer without being asked', async () => {
  const h = await relaunch(await connected());
  assert.ok(await until(() => h.store.state.status === 'connected'), 'the saved computer was never reached');
  // The saved pairing carries no invitation, so this is trust, not a fresh enrollment.
  assert.equal(h.sent.find(item => item.type === 'open').pairing.invite, undefined);
  h.store.dispose();
});

test('disconnecting by hand outlives the launch it was pressed in', async () => {
  const first = await connected();
  await first.store.actions.disconnect();
  assert.equal(JSON.parse(first.memory.get('connection')!).autoConnect, false);
  const h = await relaunch(first);
  await delay(30);
  assert.equal(opens(h.sent), 0);
  assert.equal(h.store.state.status, 'offline');
  assert.equal(h.store.state.reconnecting, false);
  // Put away, not forgotten: the computer is still there to be picked back up.
  assert.equal(h.store.state.host?.id, 'host1');
  await h.store.actions.reconnect!();
  assert.equal(h.store.state.status, 'connected');
  h.store.dispose();
});

test('asking for the computer back restores it to reconnecting on its own', async () => {
  const first = await connected();
  await first.store.actions.disconnect();
  await first.store.actions.reconnect!();
  assert.equal(JSON.parse(first.memory.get('connection')!).autoConnect, true);
  const h = await relaunch(first);
  assert.ok(await until(() => h.store.state.status === 'connected'), 'an explicit reconnect did not re-arm the app');
  h.store.dispose();
});

test('a computer that goes away on its own is picked back up', async () => {
  const h = await connected();
  h.rpc.receive({ type: 'closed' });
  assert.equal(h.store.state.status, 'offline');
  assert.ok(await until(() => h.store.state.status === 'connected'), 'the dropped connection was never retried');
  assert.equal(opens(h.sent), 2);
  h.store.dispose();
});

test('a computer that cannot be reached is given up on rather than chased forever', async () => {
  const h = await connected();
  h.handle(message => {
    if (message.type !== 'open') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId,
      message: 'Cannot reach your computer. Check that Vibyra Host is running.' });
    return true;
  });
  h.rpc.receive({ type: 'closed' });
  // One rung per delay, and then the person is told rather than watched.
  assert.ok(await until(() => opens(h.sent) === 1 + RETRY_DELAYS.length), `stopped at ${opens(h.sent)} attempts`);
  await delay(30);
  assert.equal(opens(h.sent), 1 + RETRY_DELAYS.length);
  assert.equal(h.store.state.reconnecting, false);
  assert.equal(h.store.state.status, 'error');
  assert.match(h.store.state.error!, /Cannot reach your computer/);
  h.store.dispose();
});

test('a refusal the computer took its time over is not asked for again', async () => {
  const h = await connected();
  h.store.disconnect();
  // A quick no is the network; the app keeps trying.
  h.store.auto.failed(200);
  assert.equal(h.store.state.reconnecting, true);
  h.store.auto.stop();
  // A slow one is a computer holding this phone for an approval nobody gave.
  h.store.auto.failed(90_000);
  assert.equal(h.store.state.reconnecting, false);
  await delay(30);
  assert.equal(opens(h.sent), 1);
  h.store.dispose();
});

test('an app that is away tries nothing, and connects the moment it is back', async () => {
  const h = await connected();
  h.store.suspend();
  assert.equal(h.store.state.status, 'offline');
  await delay(30);
  assert.equal(opens(h.sent), 1);
  h.store.resume();
  assert.ok(await until(() => h.store.state.status === 'connected'), 'returning to the app left it disconnected');
  h.store.dispose();
});

test('a forgotten computer is never quietly connected again', async () => {
  const h = await connected();
  await h.store.actions.forgetDevice!();
  await delay(30);
  assert.equal(opens(h.sent), 1);
  assert.equal(h.store.state.host, null);
  h.store.dispose();
});

test('cancelling a handshake is not the same as putting the computer away', async () => {
  const h = await connected();
  // What ConnectingStep does when its sheet closes on an unfinished attempt.
  h.handle(message => message.type === 'open');
  void h.store.actions.reconnect!().catch(() => {});
  await until(() => h.store.state.status === 'connecting');
  await h.store.actions.disconnect();
  assert.notEqual(JSON.parse(h.memory.get('connection')!).autoConnect, false);
  const next = await relaunch(h);
  assert.ok(await until(() => next.store.state.status === 'connected'),
    'a cancelled handshake must not disarm the next launch');
  next.store.dispose();
});
