import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudHarness, delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

const HOST = pairing.publicKey;
async function connected() {
  const remote = cloudHarness();
  const h = runtimeHarness({ remote, retryDelays: [2, 2], openTimeout: 25, locate: async () => undefined });
  const answer = (message: any) => {
    if (message.type !== 'send' || message.payload.method !== 'host.state') return false;
    h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: HOST } }); return true;
  };
  h.handle(answer);
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
  h.handle(message => answer(message) || (message.type === 'open' && message.pairing.route !== 'relay'));
  return { ...h, remote };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 500;
  while (!check() && Date.now() < deadline) await delay(1);
  assert.ok(check());
}
test('a silent former Wi-Fi address falls back to cloud on the bounded socket timeout', async () => {
  const h = await connected();
  try {
    h.rpc.receive({ type: 'closed' });
    await until(() => h.store.state.status === 'connected' && h.store.state.throughCloud === true);
    assert.deepEqual(h.remote.asked, [HOST]);
    assert.equal(h.sent.filter(message => message.type === 'open').length, 3);
  } finally { h.store.dispose(); }
});
test('disconnecting during a slow cloud grant prevents its eventual connection', async () => {
  const h = await connected();
  const connect = h.remote.connect;
  let release: (() => void) | undefined;
  h.remote.connect = async id => {
    await new Promise<void>(resolve => { release = resolve; }); return connect(id);
  };
  try {
    h.rpc.receive({ type: 'closed' });
    await until(() => Boolean(release));
    await h.store.actions.disconnect();
    release!(); await delay(30);
    assert.equal(h.store.state.status, 'offline');
    assert.equal(h.sent.filter(message => message.type === 'open' && message.pairing.route === 'relay').length, 0);
  } finally { release?.(); h.store.dispose(); }
});
