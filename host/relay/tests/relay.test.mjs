import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { startRelay } from '../src/main.mjs';
import { signToken, verifyToken, createVerifier } from '../src/tokens.mjs';

const SECRET = 'relay-test-secret-that-is-long-enough-0123456789';
const HOST = 'a'.repeat(64);
const soon = () => Math.floor(Date.now() / 1000) + 300;

/** A stand-in for the Vibyra API: records every presence batch the relay posts. */
async function fakeApi() {
  const posts = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { posts.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) }); res.writeHead(200); res.end('{"ok":true}'); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { posts, url: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}
async function relayOn(env, options = { authorization: null }) {
  const running = startRelay({ VIBYRA_RELAY_SECRET: SECRET, ...env }, false, options);
  await new Promise(resolve => running.server.listen(0, '127.0.0.1', resolve));
  return { ...running, url: `ws://127.0.0.1:${running.server.address().port}`, http: `http://127.0.0.1:${running.server.address().port}` };
}
async function open(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  const inbox = [];
  const waiters = [];
  socket.on('message', raw => { const msg = JSON.parse(raw.toString()); if (waiters.length) waiters.shift()(msg); else inbox.push(msg); });
  const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no message')), 3000);
    waiters.push(msg => { clearTimeout(timer); resolve(msg); });
  });
  const closed = new Promise(resolve => socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  return { socket, next, closed, send: msg => socket.send(JSON.stringify(msg)) };
}
const frame = text => Buffer.from(text).toString('base64');
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('relay event did not arrive');
}

test('tokens round-trip and refuse tampering, expiry and foreign secrets', () => {
  const token = signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon(), jti: 'j1' });
  assert.equal(verifyToken(SECRET, token).jti, 'j1');
  assert.equal(verifyToken('another-secret-that-is-also-long-enough-0000', token), null);
  assert.equal(verifyToken(SECRET, token.slice(0, -2) + 'AA'), null);
  assert.equal(verifyToken(SECRET, signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: 1 })), null);
  assert.equal(verifyToken(SECRET, signToken(SECRET, { role: 'admin', hostId: HOST, userId: 'u1', exp: soon() })), null);
});

test('a computer and its owner\'s phone are paired; strangers, stale tokens and absent computers are refused with a reason', async () => {
  const api = await fakeApi();
  const relay = await relayOn({ VIBYRA_API_URL: api.url });
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', exp: soon() }) });
    assert.equal((await host.next()).type, 'host.ready');

    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, name: 'Ellis iPhone',
      token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon(), jti: 'grant-1' }) });
    const opened = await host.next();
    assert.equal(opened.type, 'client.open'); assert.equal(opened.name, 'Ellis iPhone');
    const ready = await phone.next();
    assert.equal(ready.type, 'client.ready'); assert.equal(ready.clientId, opened.clientId);

    phone.send({ type: 'frame', clientId: ready.clientId, data: frame('hello from the phone') });
    assert.deepEqual(await host.next(), { type: 'frame', clientId: ready.clientId, data: frame('hello from the phone') });
    host.send({ type: 'frame', clientId: ready.clientId, data: frame('hello from the mac') });
    assert.deepEqual(await phone.next(), { type: 'frame', clientId: ready.clientId, data: frame('hello from the mac') });

    const stranger = await open(relay.url);
    stranger.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u2', exp: soon() }) });
    assert.match((await stranger.next()).message, /not online/);
    assert.equal((await stranger.closed).code, 1008);

    const stale = await open(relay.url);
    stale.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: 1 }) });
    assert.match((await stale.next()).message, /expired/);

    const nobody = await open(relay.url);
    nobody.send({ type: 'client.connect', hostId: 'b'.repeat(64), token: signToken(SECRET, { role: 'client', hostId: 'b'.repeat(64), userId: 'u1', exp: soon() }) });
    assert.match((await nobody.next()).message, /not online/);

    assert.deepEqual(relay.relay.presence(), [{ hostId: HOST, userId: 'u1', clients: 1 }]);
    phone.socket.close();
    assert.equal((await host.next()).type, 'client.close');
    host.socket.close();
    await host.closed;
    await until(() => relay.relay.presence().length === 0);
    await relay.reporter.flush();
    await until(() => api.posts.some(post => post.body.events.some(event => event.event === 'host.offline')));
    const events = api.posts.flatMap(post => post.body.events.map(event => event.event));
    assert.deepEqual(events, ['host.online', 'session.started', 'session.ended', 'host.offline']);
    assert.equal(api.posts[0].auth, `Bearer ${SECRET}`);
    assert.equal(api.posts[0].url, '/api/remote/relay/events');
    assert.equal(api.posts[0].body.events[1].jti, 'grant-1');
  } finally { relay.close(); api.close(); }
});

test('a computer registering again takes its own place, and the account can cut it off through the admin surface', async () => {
  const relay = await relayOn({});
  try {
    const token = () => signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', exp: soon() });
    const first = await open(relay.url);
    first.send({ type: 'host.register', hostId: HOST, token: token() });
    await first.next();
    const firstPhone = await open(relay.url);
    firstPhone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon() }) });
    await first.next(); await firstPhone.next();
    const second = await open(relay.url);
    second.send({ type: 'host.register', hostId: HOST, token: token() });
    assert.equal((await second.next()).type, 'host.ready');
    assert.equal((await first.closed).code, 1012);
    assert.equal((await firstPhone.closed).code, 1012);
    assert.equal(relay.relay.presence().length, 1);

    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon() }) });
    await second.next(); await phone.next();

    const denied = await fetch(`${relay.http}/admin/disconnect`, { method: 'POST', body: JSON.stringify({ hostId: HOST }) });
    assert.equal(denied.status, 401);
    const cut = await fetch(`${relay.http}/admin/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ hostId: HOST }) });
    assert.deepEqual(await cut.json(), { ok: true, disconnected: true });
    assert.equal((await phone.closed).code, 1012);
    assert.equal((await second.closed).code, 1008);
    assert.deepEqual((await (await fetch(`${relay.http}/admin/presence`, { headers: { Authorization: `Bearer ${SECRET}` } })).json()).hosts, []);
    assert.equal((await (await fetch(`${relay.http}/health`)).json()).ok, true);
  } finally { relay.close(); }
});

test('replacing a computer under another account closes old phones and admits only new ones', async () => {
  const api = await fakeApi();
  const relay = await relayOn({ VIBYRA_API_URL: api.url });
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', exp: soon() }) });
    await host.next();
    const oldPhone = await open(relay.url);
    oldPhone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon() }) });
    await host.next(); await oldPhone.next();

    const replacement = await open(relay.url);
    replacement.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u2', exp: soon() }) });
    assert.equal((await replacement.next()).type, 'host.ready');
    assert.equal((await host.closed).code, 1012);
    assert.equal((await oldPhone.closed).code, 1012);
    assert.deepEqual(relay.relay.presence(), [{ hostId: HOST, userId: 'u2', clients: 0 }]);
    await relay.reporter.flush();
    await until(() => api.posts.some(post => post.body.events.some(event => event.event === 'host.online' && event.userId === 'u2')));
    const events = api.posts.flatMap(post => post.body.events);
    assert.ok(events.some(event => event.event === 'host.offline' && event.userId === 'u1'));

    const denied = await open(relay.url);
    denied.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon() }) });
    assert.match((await denied.next()).message, /not online/);
    const current = await open(relay.url);
    current.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u2', exp: soon() }) });
    assert.equal((await replacement.next()).type, 'client.open');
    assert.equal((await current.next()).type, 'client.ready');
  } finally { relay.close(); api.close(); }
});

test('a hand-run Host with a static token file still registers, and no phone token can match it', async () => {
  const token = 'static-host-token-0123456789abcdef0123456789';
  const relay = await relayOn({ VIBYRA_RELAY_HOST_TOKENS: JSON.stringify({ [HOST]: createHash('sha256').update(token).digest('hex') }) });
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token });
    assert.equal((await host.next()).type, 'host.ready');
    assert.equal(relay.relay.presence()[0].userId, `static:${HOST}`);
    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token });
    assert.match((await phone.next()).message, /expired/);
  } finally { relay.close(); }
});


test('a membership lease ends its phone session and preserves the computer', async () => {
  const relay = await relayOn({});
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'lease', exp: soon() }) });
    await host.next();
    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, {
      role: 'client', hostId: HOST, userId: 'lease', exp: soon(), accessUntil: Math.floor(Date.now() / 1000) + 2,
    }) });
    assert.equal((await phone.next()).type, 'client.ready');
    assert.equal((await host.next()).type, 'client.open');
    assert.match((await phone.next()).message, /membership has ended/);
    assert.equal((await phone.closed).code, 1008);
    assert.equal((await host.next()).type, 'client.close');
    assert.equal(host.socket.readyState, WebSocket.OPEN);
    assert.equal(relay.relay.presence()[0].clients, 0);
    host.socket.close(); await host.closed;
  } finally { await relay.close(); }
});

test('generation revocation closes old sockets, fences stale grants and acknowledges absent hosts', async () => {
  let admissions = 0;
  const authorization = { admit: async () => { admissions++; return 'lease'; }, bind() {}, release() {}, close() {}, metrics: {} };
  const relay = await relayOn({}, { authorization });
  try {
    const host = await open(relay.url);
    const token = signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', generation: 1, exp: soon() });
    host.send({ type: 'host.register', hostId: HOST, token });
    assert.equal((await host.next()).type, 'host.ready'); assert.equal(admissions, 1);
    const cut = () => fetch(`${relay.http}/admin/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ hostId: HOST, generation: 2 }) });
    assert.deepEqual(await (await cut()).json(), { ok: true, disconnected: true, generation: 2 });
    await host.closed;
    assert.deepEqual(await (await cut()).json(), { ok: true, disconnected: true, generation: 2 });
    const stale = await open(relay.url); stale.send({ type: 'host.register', hostId: HOST, token });
    assert.match((await stale.next()).message, /expired/); assert.equal((await stale.closed).code, 1008);
    const denied = await fetch(`${relay.http}/admin/diagnostics`); assert.equal(denied.status, 401);
    const stats = await fetch(`${relay.http}/admin/diagnostics`, { headers: { Authorization: `Bearer ${SECRET}` } });
    assert.equal(stats.status, 200); const diagnostic = await stats.json();
    assert.equal(diagnostic.relay.hosts, 0);
    assert.ok(diagnostic.runtime.rssBytes > 0);
    assert.ok(diagnostic.runtime.heapUsedBytes > 0);
    assert.ok(Number.isFinite(diagnostic.runtime.eventLoopDelayP95Ms));
    assert.ok(diagnostic.runtime.eventLoopDelayMaxMs >= 0);
  } finally { relay.close(); }
});

test('production default rejects admission when authoritative API is not configured', async () => {
  const relay = await relayOn({}, {});
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', generation: 1, exp: soon() }) });
    assert.match((await host.next()).message, /Authorization unavailable/);
    assert.equal((await host.closed).code, 1008); assert.equal(relay.relay.presence().length, 0);
  } finally { relay.close(); }
});

test('a newer grant cannot attach to an older generation host', async () => {
  const relay = await relayOn({});
  try {
    const host = await open(relay.url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', generation: 1, exp: soon() }) });
    await host.next();
    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', generation: 2, exp: soon() }) });
    assert.match((await phone.next()).message, /not online/); assert.equal((await phone.closed).code, 1008);
    const newer = await open(relay.url);
    newer.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', generation: 2, exp: soon() }) });
    await newer.next(); await host.closed;
    const older = await open(relay.url);
    older.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', generation: 1, exp: soon() }) });
    assert.match((await older.next()).message, /expired/); await older.closed;
  } finally { relay.close(); }
});


test('default signing key ID matches PHP-issued current tokens', () => {
  const verify = createVerifier({ secret: SECRET });
  const claims = { role: 'host', hostId: HOST, userId: 'u1', exp: soon(), kid: 'current' };
  assert.ok(verify('host', HOST, signToken(SECRET, claims)));
  assert.equal(verify('host', HOST, signToken(SECRET, { ...claims, kid: 'unknown' })), null);
});
