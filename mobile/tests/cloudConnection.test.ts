import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudHarness, delay, hostState, pairing, runtimeHarness, type HarnessOptions } from './runtimeHarness';
import type { WorkspaceStore } from '../src/state/WorkspaceStore';

const HOST = 'ab'.repeat(32);
const opens = (sent: any[]) => sent.filter(item => item.type === 'open');
async function until(check: () => boolean, ms = 600) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await delay(1);
  return check();
}
type Harness = ReturnType<typeof runtimeHarness>;
/** The computer answers `host.state` under its key: the account files it under
 *  the same key, and the store refuses a workspace from any other identity. */
function answersAsHost(h: Harness, more?: (message: any) => boolean) {
  h.handle(message => {
    if (message.type === 'send' && message.payload.method === 'host.state') {
      h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: HOST } }); return true;
    }
    return more?.(message) ?? false;
  });
}
function harness(options: HarnessOptions = {}) {
  const h = runtimeHarness({ retryDelays: [2, 2], ...options });
  answersAsHost(h);
  return h;
}
async function signedIn(options: HarnessOptions = {}) {
  const h = harness(options);
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  return h;
}
async function relaunch(previous: { memory: Map<string, string>; flags: Map<string, string>; store: WorkspaceStore }, options: HarnessOptions = {}) {
  previous.store.dispose();
  const next = harness({ memory: previous.memory, flags: previous.flags, ...options });
  await next.store.initialize();
  return next;
}

test('a computer from the account list is reached through the relay with a grant, and approved on the computer like a nearby one', async () => {
  const remote = cloudHarness();
  const h = await signedIn({ remote });
  let statusWhenOpened: string | undefined;
  answersAsHost(h, message => { if (message.type === 'open') statusWhenOpened = h.store.state.status; return false; });
  assert.deepEqual((await h.store.actions.listComputers!()).computers.map(c => c.name), ['Ellis MacBook']);
  await h.store.actions.connectComputer!(HOST);
  assert.equal(h.store.state.status, 'connected');
  const [open] = opens(h.sent);
  assert.equal(open.pairing.route, 'relay');
  assert.equal(open.pairing.url, 'wss://relay.vibyra.test');
  assert.equal(open.pairing.relayToken, 'grant-1', 'the grant rides on the connection the runtime opens');
  assert.equal(open.pairing.publicKey, HOST, 'the computer\'s own key is pinned, not the relay\'s');
  assert.equal(open.pairing.invite, undefined);
  assert.equal(statusWhenOpened, 'pairing', 'a computer that has not seen this phone holds it for approval');
  assert.equal(h.store.state.throughCloud, true);
  assert.equal(h.store.state.hostAddress, null, 'the relay\'s address is not where the computer is');
  const saved = JSON.parse(h.memory.get('connection')!);
  assert.equal(saved.pairing.relayToken, undefined, 'a grant lasts minutes and is never saved');
  assert.equal(saved.pairing.route, 'relay');
  h.store.dispose();
});

test('reopening the app asks the cloud for a fresh grant before reconnecting the saved computer', async () => {
  const remote = cloudHarness();
  const first = await signedIn({ remote });
  await first.store.actions.connectComputer!(HOST);
  const h = await relaunch(first, { remote });
  assert.ok(await until(() => h.store.state.status === 'connected'), 'the cloud computer was never reached again');
  assert.deepEqual(remote.asked, [HOST, HOST]);
  assert.equal(opens(h.sent)[0].pairing.relayToken, 'grant-2');
  assert.equal(h.store.state.host?.name, 'Test computer');
  assert.equal(h.store.state.throughCloud, true);
  h.store.dispose();
});

test('a trusted computer out of reach on this network is reached through the cloud when the account says it is online', async () => {
  const remote = cloudHarness();
  const h = await signedIn({ remote });
  await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST, publicKey: HOST }));
  assert.equal(h.store.state.status, 'connected');
  assert.equal(h.store.state.throughCloud, false);
  answersAsHost(h, message => {
    if (message.type !== 'open' || message.pairing.route === 'relay') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Cannot reach your computer. Check that Vibyra Host is running.' });
    return true;
  });
  h.rpc.receive({ type: 'closed' });
  assert.ok(await until(() => h.store.state.status === 'connected'), 'the cloud was never tried');
  assert.deepEqual(remote.asked, [HOST]);
  assert.equal(h.store.state.throughCloud, true);
  assert.equal(JSON.parse(h.memory.get('connection')!).pairing.route, 'relay');
  h.store.dispose();
});

test('a delayed cloud grant survives the Wi-Fi retry delay and opens exactly one relay connection', async () => {
  const remote = cloudHarness();
  const connect = remote.connect;
  remote.connect = async id => { await delay(40); return connect(id); };
  const h = await signedIn({ remote });
  try {
    await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST, publicKey: HOST }));
    answersAsHost(h, message => {
      if (message.type !== 'open' || message.pairing.route === 'relay') return false;
      h.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Wi-Fi is unreachable.' });
      return true;
    });
    h.rpc.receive({ type: 'closed' });
    assert.ok(await until(() => h.store.state.status === 'connected' && h.store.state.throughCloud === true),
      'the Wi-Fi retry discarded the delayed cloud grant');
    assert.equal(remote.asked.length, 1);
    assert.equal(opens(h.sent).filter(open => open.pairing.route === 'relay').length, 1);
  } finally { h.store.dispose(); }
});

test('the cloud is not tried for a computer the account says is offline, nor signed out, nor for a first pairing', async () => {
  const remote = cloudHarness(HOST, false);
  const h = await signedIn({ remote });
  await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST, publicKey: HOST }));
  answersAsHost(h, message => {
    if (message.type !== 'open') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Cannot reach your computer. Check that Vibyra Host is running.' });
    return true;
  });
  h.rpc.receive({ type: 'closed' });
  await delay(40);
  assert.equal(h.store.state.status, 'error');
  assert.deepEqual(remote.asked, [HOST, HOST], 'asked, and told no, on each rung');
  assert.ok(opens(h.sent).every(open => open.pairing.route !== 'relay'));
  h.store.dispose();

  remote.online = true; remote.asked.length = 0;
  const out = harness({ retryDelays: [2], remote });
  answersAsHost(out, message => {
    if (message.type !== 'open') return false;
    out.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Cannot reach your computer.' });
    return true;
  });
  await assert.rejects(out.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST, publicKey: HOST })));
  await delay(20);
  assert.deepEqual(remote.asked, [], 'a first pairing that failed is not a trusted computer, and a guest has no account');
  out.store.dispose();
});

test('back on its own Wi-Fi, a cloud computer found nearby is reached directly when the relay is slow', async () => {
  const remote = cloudHarness();
  const first = await signedIn({ remote });
  await first.store.actions.connectComputer!(HOST);
  first.store.dispose();
  const h = harness({ memory: first.memory, flags: first.flags, remote, locate: async key => key === HOST
    ? { id: 'mac', name: 'Ellis MacBook', hostId: HOST, host: '192.168.1.10', port: 4319, platform: 'macos' } : undefined });
  // Far away the relay answers first and stays. Here it is left hanging, and
  // the computer answering on this Wi-Fi is taken instead of waiting on it.
  answersAsHost(h, message => message.type === 'open' && message.pairing.route === 'relay');
  await h.store.initialize();
  assert.ok(await until(() => h.store.state.status === 'connected' && h.store.state.throughCloud === false, 3000),
    'the phone stayed on the relay while the computer was right here');
  assert.equal(h.store.state.hostAddress, '192.168.1.10:4319');
  assert.equal(JSON.parse(h.memory.get('connection')!).pairing.route, 'direct');
  assert.equal(h.store.state.host?.name, hostState.host.name);
  h.store.dispose();
});
