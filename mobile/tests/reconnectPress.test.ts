import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, pairing, runtimeHarness } from './runtimeHarness';

// What the person sees around a dropped connection: "Reconnecting…" for as long
// as the app is trying, the reason only once it has stopped, and a Reconnect
// press that misses handing over to the ladder rather than reading as an error
// the instant it was made.
const RETRY_DELAYS = [2, 2, 2];
const opens = (sent: any[]) => sent.filter(item => item.type === 'open').length;
async function until(check: () => boolean, ms = 400) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await delay(1);
  return check();
}
/** Every attempt fails the way iOS fails a computer that is not there. */
function unreachable(h: ReturnType<typeof runtimeHarness>) {
  h.handle(message => {
    if (message.type !== 'open') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId,
      message: 'Cannot reach your computer. Check that Vibyra Host is running.' });
    return true;
  });
}
async function dropped() {
  const h = runtimeHarness({ retryDelays: RETRY_DELAYS });
  await h.store.actions.connect(JSON.stringify(pairing));
  unreachable(h);
  h.rpc.receive({ type: 'closed' });
  return h;
}

test('while the app is still trying, no screen is handed an error', async () => {
  const h = await dropped();
  assert.equal(h.store.state.reconnecting, true);
  assert.equal(h.store.state.error, null);
  assert.ok(await until(() => opens(h.sent) === 2));
  assert.equal(h.store.state.reconnecting, true);
  assert.equal(h.store.state.error, null, 'a miss the ladder will retry is not an error yet');
  // Given up: now, and only now, the reason.
  assert.ok(await until(() => !h.store.state.reconnecting && opens(h.sent) === 1 + RETRY_DELAYS.length));
  assert.equal(h.store.state.status, 'error');
  assert.match(h.store.state.error!, /Cannot reach your computer/);
  h.store.dispose();
});

test('a Reconnect press that misses starts the ladder again instead of showing an error', async () => {
  const h = await dropped();
  assert.ok(await until(() => !h.store.state.reconnecting && h.store.state.status === 'error'), 'the ladder never gave up');
  // Pressed while the computer is still away: nothing is thrown at the person.
  await h.store.actions.reconnect!();
  assert.equal(h.store.state.reconnecting, true);
  assert.equal(h.store.state.error, null);
  // It is back a moment later, and the renewed ladder picks it up by itself.
  h.handle();
  assert.ok(await until(() => h.store.state.status === 'connected'), 'a computer back after the press was never reached');
  h.store.dispose();
});

test('a refused connection is reported in the computer’s words, not as the socket closing', async () => {
  const h = runtimeHarness({ retryDelays: RETRY_DELAYS });
  h.handle(message => {
    if (message.type !== 'open') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Computer refused the connection.' });
    return true;
  });
  // A first pairing has no ladder behind it, so its failure is the press's to show.
  await assert.rejects(h.store.actions.connect(JSON.stringify(pairing)), /Computer refused the connection/);
  h.store.dispose();
});
