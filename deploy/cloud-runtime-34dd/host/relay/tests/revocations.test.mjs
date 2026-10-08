import assert from 'node:assert/strict';
import test from 'node:test';
import { createRevocations } from '../src/revocations.mjs';
import { SECRET, HOST, token, running, open, hostOn, phoneOn } from './securityHarness.mjs';

test('grant revocation closes only its client, acknowledges absence and fences token replay', async () => {
  const relay = await running();
  try {
    const host = await hostOn(relay);
    const first = await phoneOn(relay, host, 'grant-1');
    const second = await phoneOn(relay, host, 'grant-2');
    const response = await fetch(`${relay.url.replace('ws:', 'http:')}/admin/disconnect`, {
      method: 'POST', headers: { Authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ hostId: HOST, grantId: 'grant-1' }),
    });
    assert.deepEqual(await response.json(), { ok: true, disconnected: true, grantId: 'grant-1' });
    assert.equal((await first.closed).code, 1000);
    assert.equal((await host.next()).clientId, first.clientId);
    assert.equal(second.socket.readyState, 1); assert.equal(host.socket.readyState, 1);
    second.send({ type: 'frame', clientId: second.clientId, data: 'YWJj' });
    assert.equal((await host.next()).clientId, second.clientId);
    assert.equal(relay.relay.disconnect({ hostId: HOST, grantId: 'absent-grant' }), true);
    assert.equal(relay.relay.disconnect({ hostId: 'absent-host', grantId: 'grant' }), true);
    const replay = await open(relay.url);
    replay.send({ type: 'client.connect', hostId: HOST, token: token('client', { jti: 'grant-1' }) });
    assert.match((await replay.next()).message, /expired/); await replay.closed;
  } finally { relay.close(); }
});

test('revocation while API admission is pending cannot create a client afterwards', async () => {
  let pending, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const authorization = { async admit(value) {
    if (value === clientToken) { entered(); await new Promise(resolve => { pending = resolve; }); }
    return 'lease';
  }, bind() {}, release() {}, close() {} };
  const clientToken = token('client', { jti: 'grant-racing' });
  const relay = await running({}, { authorization });
  try {
    const host = await hostOn(relay);
    const phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token: clientToken });
    await ready;
    assert.equal(relay.relay.disconnect({ hostId: HOST, grantId: 'grant-racing' }), true);
    pending();
    assert.match((await phone.next()).message, /expired/); await phone.closed;
    assert.equal(relay.relay.presence()[0].clients, 0); assert.equal(host.socket.readyState, 1);
  } finally { relay.close(); }
});

test('session hard expiry closes a client even while membership remains valid', async () => {
  const relay = await running();
  try {
    const host = await hostOn(relay);
    const phone = await phoneOn(relay, host, 'expiring', {
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 1,
      accessUntil: Math.floor(Date.now() / 1000) + 3600,
    });
    assert.match((await phone.next()).message, /session or membership has ended/);
    assert.equal((await phone.closed).code, 1008); assert.equal(host.socket.readyState, 1);
  } finally { relay.close(); }
});

test('revocation memory is bounded and survives the maximum token and lease race', () => {
  let now = 0;
  const revocations = createRevocations(new Map(), () => {}, { now: () => now, capacity: 1 });
  revocations.disconnect({ hostId: HOST, grantId: 'first' });
  now = 479999;
  assert.equal(revocations.stale({ hostId: HOST, jti: 'first' }), true);
  assert.throws(() => revocations.disconnect({ hostId: HOST, grantId: 'second' }), /capacity/);
  now = 480000;
  assert.equal(revocations.disconnect({ hostId: HOST, grantId: 'second' }), true);
  assert.equal(revocations.stale({ hostId: HOST, jti: 'second' }), true);
});
