import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthorization } from '../src/authorization.mjs';
import { running, hostOn, open, token, HOST } from './securityHarness.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('signed authorization is forwarded on admission and renewal; loss closes the socket', async () => {
  let time = Date.now(), signed = 'ra1.first.signature';
  const calls = [];
  const auth = createAuthorization({ apiUrl: 'https://fixture', secret: 'fixture', now: () => time,
    fetchImpl: async (_, request) => {
      const body = JSON.parse(request.body); calls.push(body);
      const role = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url')).role;
      return { ok: true, json: async () => ({ ok: true, allowed: true, ...(role === 'client' && signed ? { authorization: signed } : {}) }) };
    } });
  const relay = await running({}, { authorization: auth });
  try {
    const host = await hostOn(relay), phone = await open(relay.url);
    phone.send({ type: 'client.connect', hostId: HOST, token: token('client', { jti: 'a'.repeat(32) }) });
    const ready = await phone.next(), admission = await host.next();
    assert.equal(admission.authorization, signed);
    time += 4000;
    phone.send({ type: 'frame', clientId: ready.clientId, data: Buffer.from('ciphertext').toString('base64') });
    await host.next();
    const activity = Math.floor(time / 1000);
    signed = 'ra1.renewed.signature'; time += 60000; await auth.tick(); await settle();
    const renewal = await host.next(); assert.equal(renewal.type, 'client.authorize'); assert.equal(renewal.authorization, signed);
    const renewalCall = calls.findLast(call => call.renewal && JSON.parse(Buffer.from(call.token.split('.')[1], 'base64url')).role === 'client');
    assert.equal(renewalCall.activityAt, activity);
    signed = null; time += 60000; await auth.tick(); await settle();
    assert.equal((await phone.closed).code, 1008);
  } finally { relay.close(); auth.close(); }
});
