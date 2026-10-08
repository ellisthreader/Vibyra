import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { createAllowance } from '../src/allowance.mjs';
import { startRelay } from '../src/main.mjs';
import { createReporter } from '../src/presence.mjs';
import { signToken } from '../src/tokens.mjs';

const SECRET = 'relay-test-secret-that-is-long-enough-0123456789';
const HOST = 'c'.repeat(64);
const soon = () => Math.floor(Date.now() / 1000) + 300;

test('an account under its rate carries on; a burst over it waits only as long as the overshoot', () => {
  let clock = 0;
  const allowance = createAllowance({ bytesPerSecond: 1000, slowedBytesPerSecond: 100, now: () => clock });
  assert.equal(allowance.charge(1, 600), 0);
  assert.equal(allowance.charge(1, 400), 0);
  assert.equal(allowance.charge(1, 500), 500, 'half a second over a 1000 B/s rate');
  clock += 2000;
  assert.equal(allowance.charge(1, 900), 0, 'the bucket refills with time, up to one second of data');
  assert.equal(allowance.charge(2, 1000), 0, 'each account has its own bucket');
});

test('a slowed account refills at the slowed rate, and usage is reported once', () => {
  let clock = 0;
  const allowance = createAllowance({ bytesPerSecond: 1000, slowedBytesPerSecond: 100, now: () => clock });
  allowance.charge('7', 50);
  allowance.setSlowed([7]);
  assert.equal(allowance.isSlowed('7'), true);
  assert.equal(allowance.charge('7', 300), 2000, 'its bucket drops to the slowed one second (100 B), so 300 B is 200 B over');
  allowance.setSlowed('not a list');
  assert.equal(allowance.isSlowed(7), true, 'a malformed reply leaves the list alone');
  allowance.setSlowed([]);
  assert.equal(allowance.isSlowed(7), false);
  assert.deepEqual(allowance.drain(), { 7: 350 });
  assert.deepEqual(allowance.drain(), {});
});

test('the reporter sends usage with its heartbeat and applies the slowed accounts the API names', async () => {
  const bodies = [];
  let slowed = null;
  const reporter = createReporter({ apiUrl: 'http://api.test', secret: SECRET, relayId: 'r1', heartbeatMs: 20, flushMs: 1,
    usage: () => ({ 42: 1234 }), onReply: body => { slowed = body.slowed; },
    fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response('{"ok":true,"slowed":[42]}', { status: 200 }); } });
  reporter.start();
  try {
    for (let i = 0; i < 100 && !slowed; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const usage = bodies.flatMap(body => body.events).find(event => event.event === 'usage');
    assert.deepEqual(usage.bytes, { 42: 1234 });
    assert.deepEqual(slowed, [42]);
  } finally { reporter.stop(); }
});

async function open(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  const inbox = []; const waiters = [];
  socket.on('message', raw => { const msg = JSON.parse(raw.toString()); if (waiters.length) waiters.shift()(msg); else inbox.push(msg); });
  const next = (ms = 3000) => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no message')), ms);
    waiters.push(msg => { clearTimeout(timer); resolve(msg); });
  });
  return { socket, next, send: msg => socket.send(JSON.stringify(msg)) };
}

test('a slowed account is slowed down, never disconnected, and every frame still arrives in order', async () => {
  const allowance = createAllowance({ slowedBytesPerSecond: 2048 });
  allowance.setSlowed(['u1']);
  const running = startRelay({ VIBYRA_RELAY_SECRET: SECRET }, false, { authorization: null, allowance });
  await new Promise(resolve => running.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${running.server.address().port}`;
  try {
    const host = await open(url);
    host.send({ type: 'host.register', hostId: HOST, token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'u1', exp: soon() }) });
    assert.equal((await host.next()).type, 'host.ready');
    const phone = await open(url);
    phone.send({ type: 'client.connect', hostId: HOST, token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'u1', exp: soon() }) });
    await host.next();
    const { clientId } = await phone.next();
    // A burst of about 8 KB against a 2 KB/s slowed rate: what was already sent arrives,
    // then the computer is not read again until the debt is paid off.
    const started = Date.now();
    for (let i = 0; i < 4; i++) host.send({ type: 'frame', clientId, data: Buffer.alloc(1500, i).toString('base64') });
    for (let i = 0; i < 4; i++) assert.equal(Buffer.from((await phone.next(8000)).data, 'base64')[0], i);
    host.send({ type: 'frame', clientId, data: Buffer.from('after the burst').toString('base64') });
    assert.equal(Buffer.from((await phone.next(8000)).data, 'base64').toString(), 'after the burst');
    assert.ok(Date.now() - started >= 1500, 'the next frame waits for the slowed rate');
    assert.equal(phone.socket.readyState, WebSocket.OPEN);
    assert.ok(running.relay.diagnostics().allowance.pauses > 0);
  } finally { running.close(); }
});
