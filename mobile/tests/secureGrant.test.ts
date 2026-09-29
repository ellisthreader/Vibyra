import assert from 'node:assert/strict';
import test from 'node:test';
import { secureGrant } from '../src/remote/secureGrant';
import { withoutInvite } from '../src/state/connectionIdentity';
import { parsePairing } from '../src/transport/pairing';
import { relayPairing } from '../src/state/remote';
import { HOST, PUBLIC, SESSION, securityHarness } from './secureGrantHarness';

test('manual Cloud connect preserves private identity, proves it twice and requests only explicit permissions', async () => {
  const h = await securityHarness();
  try {
    const result = await secureGrant(h.store, HOST, ['preview:access', 'screen:view'], true, async () => {});
    assert.equal(result.grant.sessionId, SESSION);
    assert.deepEqual(h.store.cloudSecurityScope, { owner: h.store.token, hostId: HOST, deviceId: h.device.id, sessionId: SESSION });
    assert.match(result.privateKey, /^[a-f0-9]{64}$/);
    const grant = h.requests.find(item => item.kind === 'grant')!.data as any;
    assert.deepEqual(grant.permissions, ['preview:access', 'screen:view']);
    assert.equal(grant.proof, 'proof-value');
    assert.equal('privateKey' in grant, false);
    assert.deepEqual(h.requests.filter(item => ['passkey', 'connect'].includes(item.kind)).map(item => item.kind), ['passkey', 'connect']);
    const saved = JSON.parse([...h.memory.entries()].find(([key]) => key.startsWith('remote-device:'))![1]);
    assert.equal(saved.privateKey, result.privateKey);
    assert.equal(h.store.state.remoteSecurity, undefined);
    const pairing = relayPairing(result.grant);
    assert.equal(pairing.remoteSessionId, SESSION);
    assert.equal(pairing.remoteAuthorizationId, SESSION);
    const stored = withoutInvite(pairing);
    assert.equal(stored.relayToken, undefined);
    assert.equal(stored.remoteSessionId, undefined);
    assert.equal(stored.remoteAuthorizationId, undefined);
  } finally { h.store.dispose(); }
});

test('unknown device waits for desktop approval before any passkey or session request', async () => {
  const h = await securityHarness();
  h.device.approvedAt = null;
  let waited = 0;
  try {
    await secureGrant(h.store, HOST, ['terminal:access'], true, async () => {
      waited++;
      assert.equal(h.requests.some(item => item.kind === 'begin' || item.kind === 'grant'), false);
      assert.equal(h.store.state.remoteSecurity?.pairingCode, '123456');
      h.device.approvedAt = new Date().toISOString();
    });
    assert.equal(waited, 1);
  } finally { h.store.dispose(); }
});

test('desktop denial or revocation fails before remote session creation', async () => {
  for (const field of ['deniedAt', 'revokedAt'] as const) {
    const h = await securityHarness(); h.device[field] = new Date().toISOString();
    try {
      await assert.rejects(secureGrant(h.store, HOST, ['screen:view'], true), /denied or revoked/);
      assert.equal(h.requests.some(item => item.kind === 'grant'), false);
    } finally { h.store.dispose(); }
  }
});

test('wider permissions require renewed desktop approval before opening passkey verification', async () => {
  const h = await securityHarness(); h.device.permissions = ['screen:view'];
  try {
    await assert.rejects(secureGrant(h.store, HOST, ['terminal:access'], true), /different approved permissions/);
    assert.equal(h.requests.some(item => ['passkey', 'begin', 'grant'].includes(item.kind)), false);
  } finally { h.store.dispose(); }
});

test('permission or computer substitution in challenge cannot authorize a connection', async () => {
  for (const change of ['host', 'permissions']) {
    const h = await securityHarness(); const original = h.api.challenge;
    h.api.challenge = async (...args) => {
      const result = await original(...args);
      if (args[1] === 'connect') {
        if (change === 'host') result.hostId = 'dd'.repeat(32);
        else result.permissions = ['terminal:access'];
      }
      return result;
    };
    try {
      await assert.rejects(secureGrant(h.store, HOST, ['screen:view'], true), /permissions changed/);
      assert.equal(h.requests.some(item => item.kind === 'grant'), false);
    } finally { h.store.dispose(); }
  }
});

test('background reconnect requests fresh proof without opening a passkey browser', async () => {
  const h = await securityHarness();
  try {
    await secureGrant(h.store, HOST, ['terminal:access'], true);
    h.requests.length = 0;
    await secureGrant(h.store, HOST);
    assert.equal(h.requests.some(item => ['browser', 'begin', 'register'].includes(item.kind)), false);
    assert.equal(h.requests.filter(item => item.kind === 'connect').length, 1);
    h.remote.connect = async () => { throw new Error('Verify with your passkey before connecting.'); };
    await assert.rejects(secureGrant(h.store, HOST), /passkey/);
    assert.equal(h.requests.some(item => item.kind === 'browser'), false);
  } finally { h.store.dispose(); }
});

test('pending session obtains a second one-use proof after desktop approval', async () => {
  const h = await securityHarness(); h.pending();
  try {
    await secureGrant(h.store, HOST, ['screen:view'], true, async () => {});
    const connects = h.requests.filter(item => item.kind === 'connect');
    assert.equal(connects.length, 2);
    assert.equal(h.requests.filter(item => item.kind === 'sessionToken').length, 1);
  } finally { h.store.dispose(); }
});

test('account replacement or cancellation fences pending pairing work', async () => {
  for (const change of ['account', 'disconnect']) {
    const h = await securityHarness(); h.device.approvedAt = null;
    try {
      await assert.rejects(secureGrant(h.store, HOST, ['screen:view'], true, async () => {
        if (change === 'account') h.store.token = 'another-account'; else h.store.disconnect();
      }), /account changed|connection changed/i);
      assert.equal(h.requests.some(item => item.kind === 'grant'), false);
      assert.ok(h.requests.some(item => item.kind === 'close'));
    } finally { h.store.dispose(); }
  }
});

test('partial authorization identifiers and direct-route session claims are refused', () => {
  const base = { version: 1, hostId: HOST, publicKey: PUBLIC, name: 'Mac', url: 'wss://relay.test', route: 'relay' };
  assert.throws(() => parsePairing(JSON.stringify({ ...base, remoteSessionId: SESSION })), /session authorization/);
  assert.throws(() => parsePairing(JSON.stringify({ ...base, remoteSessionId: SESSION, remoteAuthorizationId: SESSION, route: 'direct' })), /session authorization/);
});
