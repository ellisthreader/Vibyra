import test from 'node:test';
import assert from 'node:assert/strict';
import { isConnectable, nearbyPairingLink, radarAngles } from '../src/connection/nearbyPairing';
import { parsePairing } from '../src/transport/pairing';

const key = 'ab'.repeat(32);
const found = { id: 'Studio._vibyra-host._tcp.local.', name: 'Studio', hostId: key, host: '192.168.1.24', port: 4318 };

test('a resolved computer becomes a direct LAN pairing with no invitation', () => {
  const pairing = parsePairing(nearbyPairingLink(found));
  assert.equal(pairing.hostId, key);
  assert.equal(pairing.publicKey, key, 'the Host identity is its static public key');
  assert.equal(pairing.url, 'ws://192.168.1.24:4318');
  assert.equal(pairing.route, 'direct');
  assert.equal(pairing.network, 'lan');
  assert.equal(pairing.nearby, true, 'the connection expects local approval instead of a code');
  assert.equal(pairing.invite, undefined, 'discovery never carries a credential');
  const lan6 = parsePairing(nearbyPairingLink({ ...found, host: '[fd12:3456::4]' }));
  assert.equal(lan6.url, 'ws://[fd12:3456::4]:4318');
});

test('a computer is only connectable once Bonjour and Apple resolution both answered', () => {
  assert.equal(isConnectable(found), true);
  for (const partial of [{ ...found, hostId: undefined }, { ...found, host: undefined },
    { ...found, port: undefined }, { ...found, hostId: 'AB'.repeat(32) },
    { ...found, hostId: 'short' }, { ...found, port: 0 }, { ...found, port: 70000 },
    { ...found, port: 4318.5 }, { ...found, host: '' }]) {
    assert.equal(isConnectable(partial), false, JSON.stringify(partial));
    assert.throws(() => nearbyPairingLink(partial), /finished announcing its address/);
  }
});

test('discovery cannot widen what the phone will connect to', () => {
  // An untrusted record claiming a routable address stays blocked by the same
  // rule a scanned code obeys: plaintext ws is local-only.
  assert.throws(() => nearbyPairingLink({ ...found, host: '93.184.216.34' }), /secure wss/);
  // A globally allocated IPv6 stays allowed only under the explicit LAN direct
  // scope, as for a scanned code, and Noise still pins the advertised key.
  const global6 = parsePairing(nearbyPairingLink({ ...found, host: '[2606:2800:220:1::1]' }));
  assert.equal(global6.network, 'lan');
  assert.equal(global6.route, 'direct');
  assert.equal(global6.publicKey, key);
  // The nearby marker itself may not be borrowed by a relayed or non-LAN code.
  const forge = (extra: object) => JSON.stringify({ version: 1, hostId: key, name: 'Studio',
    publicKey: key, url: 'wss://example.com', nearby: true, ...extra });
  assert.throws(() => parsePairing(forge({ route: 'relay' })), /cannot use nearby pairing/);
  assert.throws(() => parsePairing(forge({ route: 'direct' })), /cannot use nearby pairing/);
  assert.throws(() => parsePairing(forge({ route: 'direct', network: 'lan', nearby: 'yes' })),
    /cannot use nearby pairing/);
});

test('blips stay put between updates and never stack on the radar face', () => {
  // Service names differ only in their first label, so an even arrangement,
  // not the hash, is what keeps two computers legibly apart.
  const ids = ['Studio', 'Workshop', 'Mini', 'Studio 2'].map(name => `${name}._vibyra-host._tcp.local.`);
  const angles = radarAngles(ids);
  assert.deepEqual(angles, radarAngles(ids), 'a live search re-emits without moving the blips');
  assert.equal(angles.length, ids.length);
  for (const [index, value] of angles.entries()) {
    assert.ok(value >= 0 && value < 360);
    for (const other of angles.slice(index + 1)) {
      const apart = Math.min(Math.abs(value - other), 360 - Math.abs(value - other));
      assert.ok(apart > 60, `angles ${value} and ${other} are only ${apart.toFixed(1)} apart`);
    }
  }
  assert.deepEqual(radarAngles([]), []);
  assert.notDeepEqual(radarAngles([ids[0]]), radarAngles([ids[1]]), 'the arrangement still varies by computer');
});
