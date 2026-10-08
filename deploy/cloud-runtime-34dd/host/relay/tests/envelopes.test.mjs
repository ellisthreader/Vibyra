import assert from 'node:assert/strict';
import test from 'node:test';
import { readEnvelope } from '../src/envelopes.mjs';
import { signToken, verifyToken } from '../src/tokens.mjs';
import { SECRET, HOST, token, running, open, hostOn, phoneOn } from './securityHarness.mjs';
const parse = (value, role) => readEnvelope(Buffer.from(JSON.stringify(value)), role);

test('admission refuses unknown fields/types and oversized values before token verification', () => {
  const valid = { type: 'client.connect', hostId: HOST, token: token('client'), name: 'iPhone' };
  assert.deepEqual(parse(valid), valid);
  for (const value of [null, [], 1, { ...valid, userId: 'victim' }, { ...valid, permissions: ['shell'] },
    { ...valid, type: 'admin.connect' }, { ...valid, hostId: {} }, { ...valid, token: 1 },
    { ...valid, token: 'x'.repeat(4097) }, { ...valid, name: 'x'.repeat(129) }])
    assert.throws(() => parse(value), /envelope/);
  assert.throws(() => readEnvelope(Buffer.alloc(6145)), /too large/);
  assert.throws(() => readEnvelope(Buffer.from('{"token":"private-secret" nope}')), error =>
    error.message === 'Invalid envelope' && !error.message.includes('private-secret'));
});

test('post-admission envelope schema rejects forged routing and unknown fields', () => {
  const frame = { type: 'frame', clientId: 'client-1', data: 'YWJj' };
  assert.deepEqual(parse(frame, 'client'), frame);
  for (const value of [{ ...frame, hostId: HOST }, { ...frame, clientId: {} },
    { type: 'client.close', clientId: 'client-1' }, { type: 'host.register', hostId: HOST, token: 'x' }])
    assert.throws(() => parse(value, 'client'), /envelope/);
  assert.deepEqual(parse({ type: 'client.close', clientId: 'client-1' }, 'host'), { type: 'client.close', clientId: 'client-1' });
});

test('wire violations close a socket without publishing attacker payloads', async () => {
  const relay = await running();
  try {
    for (const raw of ['{"token":"private-secret" nope}', ' '.repeat(6145), JSON.stringify({ type: 'client.connect', hostId: HOST, token: token('client'), userId: 'forged' })]) {
      const peer = await open(relay.url); peer.socket.send(raw);
      const error = await peer.next();
      assert.equal(error.type, 'error'); assert.equal(error.message.includes('private-secret'), false);
      assert.equal((await peer.closed).code, 1008);
    }
    const host = await hostOn(relay);
    const phone = await phoneOn(relay, host, 'grant-1');
    phone.send({ type: 'frame', clientId: phone.clientId, data: 'YWJj', command: 'forged' });
    assert.match((await phone.next()).message, /envelope/); await phone.closed;
    assert.equal((await host.next()).type, 'client.close');
  } finally { relay.close(); }
});

test('tokens reject appended components, noncanonical signatures and invalid session deadlines', () => {
  const valid = token('client');
  assert.equal(verifyToken(SECRET, `${valid}.ignored`), null);
  assert.equal(verifyToken(SECRET, `${valid}=`), null);
  for (const sessionExpiresAt of [1, '1000', 1.5]) {
    assert.equal(verifyToken(SECRET, signToken(SECRET, { role: 'client', hostId: HOST,
      userId: 'owner', exp: Math.floor(Date.now() / 1000) + 300, sessionExpiresAt })), null);
  }
});
