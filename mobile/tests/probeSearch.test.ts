import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { startProbeSearch } from '../src/connection/probeSearch';
import { probeIdentity } from '../src/connection/probeIdentity';
import { nearbyPairingLink } from '../src/connection/nearbyPairing';
import type { DiscoveryUpdate } from '../src/connection/discoveryTypes';

const computer = { id: 'ab'.repeat(32), hostId: 'ab'.repeat(32), name: 'Test Mac', host: '[::1]', port: 4319 };
const plan = async () => ({ hosts: ['[::1]'], scope: 'this computer' });

test('the real IPv6 presence endpoint produces a usable pinned pairing; private and malformed services do not', async () => {
  let mode = 'valid', requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    if (mode === 'private') { res.writeHead(404).end(); return; }
    if (mode === 'redirect') { res.writeHead(302, { location: '/elsewhere' }).end(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version: 1, id: mode === 'valid' ? computer.id : 'invalid', name: computer.name }));
  });
  server.listen(0, '::1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const found = await probeIdentity('::1', address.port, new AbortController().signal);
    assert.ok(found);
    assert.equal(found.host, '[::1]');
    const pairing = JSON.parse(nearbyPairingLink(found));
    assert.equal(pairing.url, `ws://[::1]:${address.port}`);
    assert.equal(pairing.publicKey, computer.id);
    assert.equal(pairing.invite, undefined);
    for (mode of ['private', 'invalid', 'redirect']) {
      assert.equal(await probeIdentity('[::1]', address.port, new AbortController().signal), undefined, mode);
    }
    const before = requests;
    const stopped = new AbortController(); stopped.abort();
    assert.equal(await probeIdentity('[::1]', address.port, stopped.signal), undefined);
    assert.equal(requests, before, 'an already cancelled search sends nothing');
  } finally { server.close(); server.closeAllConnections(); }
});

test('repeat passes find a newly started computer and deduplicate identities across addresses', async () => {
  let pass = 0, finish!: () => void;
  const found = new Promise<void>(resolve => { finish = resolve; });
  const updates: DiscoveryUpdate[] = [];
  const stop = startProbeSearch(async () => { pass++; return plan(); },
    async () => pass > 1 ? computer : undefined,
    update => { updates.push(update); if (update.computers.length) finish(); },
    { window: 1000, gap: 1, parallel: 2 });
  try {
    await found;
    assert.ok(pass >= 2);
    assert.equal(updates.at(-1)?.computers.length, 1);
  } finally { stop(); }
});

test('deadline aborts in-flight requests and cannot publish a late result', async () => {
  let aborted = false, finished!: () => void;
  const done = new Promise<void>(resolve => { finished = resolve; });
  const updates: DiscoveryUpdate[] = [];
  const stop = startProbeSearch(plan, async (_host, _port, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }));
    return computer;
  }, update => { updates.push(update); if (update.status === 'finished') finished(); },
  { window: 30, gap: 1, parallel: 2 });
  try {
    await done;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(aborted, true);
    assert.deepEqual(updates.at(-1), { status: 'finished', computers: [] });
  } finally { stop(); }
});

test('dismissal during plan resolution sends no probes or updates', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof plan>>) => void, probes = 0, updates = 0;
  const pending = new Promise<Awaited<ReturnType<typeof plan>>>(done => { resolve = done; });
  const stop = startProbeSearch(() => pending, async () => { probes++; return computer; }, () => { updates++; });
  stop();
  resolve(await plan());
  await new Promise(done => setImmediate(done));
  assert.equal(probes, 0);
  assert.equal(updates, 0);
});
