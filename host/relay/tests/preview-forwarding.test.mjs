import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { startRelay } from '../src/main.mjs';
import { signToken } from '../src/tokens.mjs';

const SECRET = 'relay-preview-secret-long-enough-0123456789';
const HOST = 'b'.repeat(64);
const expiry = () => Math.floor(Date.now() / 1000) + 300;

async function peer(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  const inbox = [];
  const waiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (waiters.length) waiters.shift()(message);
    else inbox.push(message);
  });
  const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay frame timed out')), 3000);
    waiters.push(message => { clearTimeout(timer); resolve(message); });
  });
  return { socket, next, send: message => socket.send(JSON.stringify(message)) };
}

test('real relay forwards a full Preview Noise frame beside terminal traffic', { timeout: 10000 }, async () => {
  // No API URL means no presence reporter network calls or retry timers.
  const relay = startRelay({ VIBYRA_RELAY_SECRET: SECRET }, false);
  await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${relay.server.address().port}`;
  try {
    const host = await peer(url);
    host.send({ type: 'host.register', hostId: HOST,
      token: signToken(SECRET, { role: 'host', hostId: HOST, userId: 'owner', exp: expiry() }) });
    assert.equal((await host.next()).type, 'host.ready');
    const phone = await peer(url);
    phone.send({ type: 'client.connect', hostId: HOST,
      token: signToken(SECRET, { role: 'client', hostId: HOST, userId: 'owner', exp: expiry() }) });
    const opened = await host.next();
    const ready = await phone.next();
    assert.equal(opened.clientId, ready.clientId);

    // 20-byte VP header + 4-byte sequence + 16 KiB data + Noise tag. The
    // relay sees only these ciphertext bytes inside a base64 JSON envelope.
    const preview = randomBytes(20 + 4 + 16 * 1024 + 16).toString('base64');
    const terminal = randomBytes(160).toString('base64');
    phone.send({ type: 'frame', clientId: ready.clientId, data: preview });
    phone.send({ type: 'frame', clientId: ready.clientId, data: terminal });
    assert.deepEqual(await host.next(), { type: 'frame', clientId: ready.clientId, data: preview });
    assert.deepEqual(await host.next(), { type: 'frame', clientId: ready.clientId, data: terminal });
    host.send({ type: 'frame', clientId: ready.clientId, data: terminal });
    host.send({ type: 'frame', clientId: ready.clientId, data: preview });
    assert.deepEqual(await phone.next(), { type: 'frame', clientId: ready.clientId, data: terminal });
    assert.deepEqual(await phone.next(), { type: 'frame', clientId: ready.clientId, data: preview });
    // A large HTML page creates more than 120 bounded Preview frames in one
    // second. It must not trip the relay's control-message flood limit.
    const burst = randomBytes(1024).toString('base64');
    for (let index = 0; index < 140; index++) host.send({ type: 'frame', clientId: ready.clientId, data: burst });
    for (let index = 0; index < 140; index++) {
      assert.deepEqual(await phone.next(), { type: 'frame', clientId: ready.clientId, data: burst });
    }
    host.socket.close(); phone.socket.close();
  } finally { relay.close(); }
});
