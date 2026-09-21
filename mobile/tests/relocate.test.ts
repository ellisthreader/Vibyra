import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, pairing, runtimeHarness, type HarnessOptions } from './runtimeHarness';
import { locateComputer, movedPairing } from '../src/connection/locateComputer';
import type { DiscoveryUpdate, NearbyComputer } from '../src/connection/discoveryTypes';
import type { WorkspaceStore } from '../src/state/WorkspaceStore';

const KEY = pairing.publicKey;
const SAVED = pairing.url;
// A Mac on an iPhone's hotspot: IPv6 only, and nothing where it was this morning.
const NOW = '[2a00:23ee:2648:5946:4da:d9b7:70b1:b131]';
const moved: NearbyComputer = { id: KEY, name: 'Test computer', hostId: KEY, host: NOW, port: 4319 };
const opens = (sent: any[]) => sent.filter(item => item.type === 'open').map(item => item.pairing.url);
async function until(check: () => boolean, ms = 400) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await delay(1);
  return check();
}
/** Pairs once, then relaunches over the same storage with the saved address
 *  answering however `saved` says: silently, or with a refusal. */
async function relaunched(saved: 'silent' | 'refused', options: HarnessOptions) {
  const first = runtimeHarness({ retryDelays: [2, 2, 2] });
  await first.store.actions.connect(JSON.stringify(pairing));
  first.store.dispose();
  const h = runtimeHarness({ memory: first.memory, flags: first.flags, retryDelays: [2, 2, 2], ...options });
  h.handle(message => {
    if (message.type !== 'open' || message.pairing.url !== SAVED) return false;
    if (saved === 'refused') h.rpc.receive({ type: 'error', connectionId: message.connectionId,
      message: 'Cannot reach your computer. Check that Vibyra Host is running.' });
    return true;
  });
  await h.store.initialize();
  return h;
}
const savedUrl = (store: WorkspaceStore) => store.saved?.pairing.url;

test('a trusted computer that went quiet is found by its key and reached where it is now', async () => {
  const asked: string[] = [];
  const h = await relaunched('silent', { locate: async key => { asked.push(key); return moved; } });
  assert.ok(await until(() => h.store.state.status === 'connected', 4000), 'the moved computer was never reached');
  assert.deepEqual(opens(h.sent), [SAVED, `ws://${NOW}:4319`]);
  assert.deepEqual(asked, [KEY], 'looked for by the key it is pinned to, and only once');
  // Remembered where it is, so the next launch goes straight there.
  const saved = h.store.saved!.pairing;
  assert.equal(saved.url, `ws://${NOW}:4319`);
  assert.equal(saved.publicKey, KEY);
  assert.equal(saved.route, 'direct');
  assert.equal(saved.network, 'lan');
  assert.equal(JSON.parse(h.memory.get('connection')!).pairing.url, `ws://${NOW}:4319`);
  h.store.dispose();
});

test('an address that refuses is looked past at once, without waiting out the grace period', async () => {
  const h = await relaunched('refused', { locate: async () => moved });
  assert.ok(await until(() => h.store.state.status === 'connected', 1000), 'the search waited for the grace period');
  assert.equal(savedUrl(h.store), `ws://${NOW}:4319`);
  h.store.dispose();
});

test('a computer found where it already was is left to the reconnect ladder', async () => {
  const here: NearbyComputer = { ...moved, host: 'localhost', port: 4318 };
  const h = await relaunched('refused', { locate: async () => here });
  assert.ok(await until(() => opens(h.sent).length >= 3, 1500), 'the ladder stopped retrying');
  assert.ok(opens(h.sent).every(url => url === SAVED), 'nothing else was dialled');
  assert.equal(savedUrl(h.store), SAVED);
  h.store.dispose();
});

test('a Disconnect pressed while the phone is looking outranks what the search finds', async () => {
  let release: (() => void) | undefined;
  const h = await relaunched('silent', { locate: () => new Promise(resolve => { release = () => resolve(moved); }) });
  assert.ok(await until(() => Boolean(release), 3000), 'the silent address was never looked past');
  await h.store.actions.disconnect();
  release!();
  await delay(20);
  assert.deepEqual(opens(h.sent), [SAVED], 'nothing was dialled after the person let go');
  assert.equal(h.store.state.status, 'offline');
  h.store.dispose();
});

test('a connection that works is never held up by a search', async () => {
  let asked = 0;
  const first = runtimeHarness({ locate: async () => { asked += 1; return moved; } });
  await first.store.actions.connect(JSON.stringify(pairing));
  await first.store.actions.reconnect!();
  assert.equal(first.store.state.status, 'connected');
  await delay(1700);
  assert.equal(asked, 0);
  first.store.dispose();
});

test('a computer this phone has never reached is not redirected', async () => {
  let asked = 0;
  const h = runtimeHarness({ locate: async () => { asked += 1; return moved; } });
  h.handle(message => {
    if (message.type !== 'open') return false;
    h.rpc.receive({ type: 'error', connectionId: message.connectionId, message: 'Cannot reach your computer.' });
    return true;
  });
  await assert.rejects(h.store.actions.connect(JSON.stringify(pairing)));
  assert.equal(asked, 0, 'a first pairing is only ever tried where its code says');
  h.store.dispose();
});

function adapter(script: (emit: (update: DiscoveryUpdate) => void) => void) {
  let stopped = 0;
  return { stopped: () => stopped, value: { available: true, start(emit: (update: DiscoveryUpdate) => void) {
    script(emit); return () => { stopped += 1; };
  } } };
}

test('locating answers with the computer carrying the pinned key and stops searching', async () => {
  const other: NearbyComputer = { ...moved, id: 'cd'.repeat(32), hostId: 'cd'.repeat(32), name: 'Someone else' };
  const search = adapter(emit => setTimeout(() => emit({ status: 'searching', computers: [other, moved] }), 5));
  assert.deepEqual(await locateComputer(search.value, KEY), moved);
  assert.equal(search.stopped(), 1);
  // An answer during start() itself still stops the search it came from.
  const eager = adapter(emit => emit({ status: 'searching', computers: [moved] }));
  assert.deepEqual(await locateComputer(eager.value, KEY), moved);
  assert.equal(eager.stopped(), 1);
});

test('locating gives up when the search ends, or runs out of time, without the computer', async () => {
  const finished = adapter(emit => setTimeout(() => emit({ status: 'finished', computers: [] }), 5));
  assert.equal(await locateComputer(finished.value, KEY), undefined);
  assert.equal(finished.stopped(), 1);
  const silent = adapter(() => {});
  assert.equal(await locateComputer(silent.value, KEY, 20), undefined);
  assert.equal(silent.stopped(), 1);
});

test('a moved pairing keeps its pins and passes the checks any pairing does', () => {
  const next = movedPairing({ ...pairing, version: 1 }, moved);
  assert.equal(next.url, `ws://${NOW}:4319`);
  assert.equal(next.hostId, pairing.hostId);
  assert.equal(next.publicKey, KEY);
  // A search never widens what the phone will dial: no public IPv4 without TLS.
  assert.throws(() => movedPairing({ ...pairing, version: 1 }, { ...moved, host: '8.8.8.8' }));
});
