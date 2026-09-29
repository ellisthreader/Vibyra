// Uses only the explicitly supplied disposable PHP/SQLite fixture; never production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startRelay } from '../src/main.mjs';
import { createAuthorization } from '../src/authorization.mjs';
const fixturePath = process.argv[2] ?? process.env.VIBYRA_API_FIXTURE;
assert.ok(fixturePath, 'Pass the disposable fixture.json path');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const generator = new URL('./api-integration-fixture.php', import.meta.url);
assert.equal(new URL(fixture.apiUrl).hostname, '127.0.0.1');
let now = 0;
const auth = createAuthorization({ apiUrl: fixture.apiUrl, secret: fixture.reportSecret, now: () => now });
const relay = startRelay({ VIBYRA_RELAY_SECRET: fixture.reportSecret }, false, { authorization: auth });
await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
const url = `ws://127.0.0.1:${relay.server.address().port}`;
const peers = [];
async function connect(role, token) {
  const socket = new WebSocket(url); peers.push(socket); await once(socket, 'open');
  const ready = once(socket, 'message');
  socket.send(JSON.stringify({ type: role === 'host' ? 'host.register' : 'client.connect', hostId: fixture.hostId, token }));
  return { socket, reply: JSON.parse((await ready)[0]) };
}
try {
  const host = await connect('host', fixture.hostToken); assert.equal(host.reply.type, 'host.ready');
  const phone = await connect('client', fixture.clientToken); assert.equal(phone.reply.type, 'client.ready');
  const data = Buffer.from('private synthetic bytes').toString('base64'); const received = once(phone.socket, 'message');
  host.socket.send(JSON.stringify({ type: 'frame', clientId: phone.reply.clientId, data }));
  assert.equal(JSON.parse((await received)[0]).data, data);
  execFileSync('php', [generator.pathname, 'revoke', fixture.backend, fixture.directory, String(fixture.port)], { stdio: 'pipe' });
  const hostClosed = once(host.socket, 'close'); const phoneClosed = once(phone.socket, 'close');
  now = 60000; await auth.tick();
  await Promise.race([Promise.all([hostClosed, phoneClosed]), new Promise((_, reject) => setTimeout(() => reject(new Error('Revocation did not close sockets')), 6000))]);
  const stale = await connect('host', fixture.hostToken); assert.equal(stale.reply.type, 'error');
  assert.equal(relay.relay.presence().length, 0);
  console.log(JSON.stringify({ ok: true, admission: 'real PHP API', forwarding: 'passed', failedAdminDeliveryRenewalRevocation: 'passed', staleReadmission: 'denied' }));
} finally { for (const peer of peers) peer.terminate(); relay.close(); }
