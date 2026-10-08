import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePairing } from '../src/transport/pairing';
const pairing = { version: 1, hostId: 'host-1', name: 'Ellis’s Mac', publicKey: 'ab'.repeat(32),
  url: 'ws://192.168.1.10:4318', invite: 'a'.repeat(64), expiresAt: '2099-01-01T00:00:00Z' };

test('host QR links decode UTF-8 names and pinned public keys', () => {
  const link = 'vibyra://pair?data=' + Buffer.from(JSON.stringify(pairing)).toString('base64url');
  assert.deepEqual(parsePairing(link), pairing);
});
test('expired invitations and unsupported links are rejected', () => {
  assert.throws(() => parsePairing(JSON.stringify({ ...pairing, expiresAt: '2020-01-01' })), /expired/);
  assert.throws(() => parsePairing('https://example.com/pair'), /pairing code/);
  assert.throws(() => parsePairing(JSON.stringify({ ...pairing, version: 2 })), /unsupported/);
  assert.throws(() => parsePairing(JSON.stringify({ ...pairing, publicKey: 'unverified' })), /unsupported/);
});
test('internet and relay addresses require WSS; credentials never enter pairing URL', () => {
  for (const url of ['ws://example.com', 'ws://192.168.1.10.evil.test', 'wss://name:secret@example.com', 'https://example.com']) {
    assert.throws(() => parsePairing(JSON.stringify({ ...pairing, url })));
  }
  assert.throws(() => parsePairing(JSON.stringify({ ...pairing, route: 'relay' })), /secure wss/);
  assert.equal(parsePairing(JSON.stringify({ ...pairing, route: 'relay', url: 'wss://relay.example.com' })).route, 'relay');
});
test('reconnect descriptors do not require an enrollment invitation', () => {
  const { invite: _invite, expiresAt: _expires, ...saved } = pairing;
  assert.equal(parsePairing(JSON.stringify(saved)).hostId, 'host-1');
  assert.throws(() => parsePairing(JSON.stringify({ ...pairing, invite: {} })), /invalid invitation/);
});
test('a cloud grant rides on a relay pairing, is bounded, and may use a loopback relay only for development', () => {
  const cloud = { version: 1, hostId: 'ab'.repeat(32), name: 'Ellis MacBook', publicKey: 'ab'.repeat(32),
    url: 'wss://relay.vibyra.test', route: 'relay', relayToken: 'v1.claims.signature' };
  assert.equal(parsePairing(JSON.stringify(cloud)).relayToken, 'v1.claims.signature');
  assert.throws(() => parsePairing(JSON.stringify({ ...cloud, relayToken: 'x'.repeat(4097) })), /invalid cloud grant/);
  assert.throws(() => parsePairing(JSON.stringify({ ...cloud, relayToken: 7 })), /invalid cloud grant/);
  assert.equal(parsePairing(JSON.stringify({ ...cloud, url: 'ws://127.0.0.1:8788' })).route, 'relay');
  assert.throws(() => parsePairing(JSON.stringify({ ...cloud, url: 'ws://192.168.1.10:8788' })), /secure wss/);
  // A relay pairing never borrows nearby approval semantics by claiming to be nearby.
  assert.throws(() => parsePairing(JSON.stringify({ ...cloud, nearby: true })), /nearby pairing/);
});
