import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOPBACK, LOOPBACK_V6, PROBE_PORTS, THIS_COMPUTER, isPrivate, probeAddress, probePlan } from '../src/connection/probeTargets';

test('an address the phone already talks to is usable, in whatever form', () => {
  for (const value of ['192.168.1.10', '192.168.1.10:8081', 'http://192.168.1.10:8081',
    'exp://192.168.1.10:8081', 'http://192.168.1.10:8081/index.bundle?platform=ios']) {
    assert.equal(probeAddress(value), '192.168.1.10', value);
  }
  // Loopback reaches the Simulator's Mac. A CLAT shim cannot carry pairing.
  assert.equal(probeAddress('http://127.0.0.1:8081'), '127.0.0.1');
  assert.equal(probeAddress('192.0.0.2'), undefined, 'CLAT cannot carry a pairing');
  assert.equal(probeAddress('169.254.4.9'), '169.254.4.9');
  assert.equal(probeAddress('10.0.0.4'), '10.0.0.4');
  assert.equal(probeAddress('172.16.9.1'), '172.16.9.1');
  assert.equal(probeAddress('100.96.0.7'), '100.96.0.7', 'carrier-grade NAT covers private meshes');
  // Nothing routable, nothing malformed, nothing that is not an address.
  for (const value of ['93.184.216.34', '172.32.0.1', '8.8.8.8', 'localhost', 'example.com',
    'https://vibyra.com', '192.168.1', '192.168.1.999', '', undefined, null]) {
    assert.equal(probeAddress(value), undefined, String(value));
  }
});

test('only a real private range is widened to a whole /24', () => {
  assert.equal(isPrivate('192.168.1.10'), true);
  for (const address of ['127.0.0.1', '192.0.0.2', '169.254.4.9']) {
    assert.equal(isPrivate(address), false, `${address} is a link, not a subnet to sweep`);
  }
  const plan = probePlan([undefined, 'exp://192.168.1.10:8081', '192.168.1.24']);
  assert.ok(plan);
  assert.equal(plan.scope, '192.168.1.×');
  assert.deepEqual(plan.hosts.slice(0, 2), ['192.168.1.10', '192.168.1.24'],
    'the known hosts lead, because they are the likeliest computer');
  assert.ok(plan.hosts.includes(LOOPBACK), 'loopback is always asked');
  assert.equal(new Set(plan.hosts).size, plan.hosts.length, 'no address is asked twice');
  assert.deepEqual(probePlan(['192.168.1.10']), probePlan(['192.168.1.10']), 'a repeat search is identical');
});

test('a Simulator with only a loopback host still has somewhere to look', () => {
  // The exact case that used to report "no network to search".
  const plan = probePlan(['http://127.0.0.1:8081']);
  assert.ok(plan, 'a loopback-only client can still search');
  assert.deepEqual(plan.hosts, [LOOPBACK, LOOPBACK_V6], 'loopback is asked directly, never swept');
  assert.equal(plan.scope, THIS_COMPUTER, 'named for the person, not as an address');
  // A translated IPv4 shim is rejected, retaining both local fallbacks.
  const tethered = probePlan(['192.0.0.2:8081']);
  assert.deepEqual(tethered?.hosts, [LOOPBACK, LOOPBACK_V6]);
  assert.equal(tethered?.scope, THIS_COMPUTER);
});

test('the internet is never swept, and only documented ports are asked', () => {
  // Nothing public survives, so the plan falls back to loopback alone.
  assert.deepEqual(probePlan(['example.com', '8.8.8.8', undefined])?.hosts, [LOOPBACK, LOOPBACK_V6]);
  // A second, unrelated private address does not widen the sweep.
  const plan = probePlan(['192.168.1.10', '10.0.0.4']);
  assert.ok(plan);
  assert.equal(plan.hosts.filter(host => host.startsWith('10.')).length, 1, 'one subnet is swept');
  assert.deepEqual(PROBE_PORTS, [4318, 4319]);
});


test('IPv6-only computers are probed directly with bracketed URLs and no sweep', () => {
  for (const value of ['::1', '[::1]', 'exp://[::1]:8081']) {
    assert.equal(probeAddress(value), '[::1]');
  }
  for (const value of ['fd12:3456::4', '[fd12:3456::4]:8081', 'exp://[fd12:3456::4]:8081']) {
    assert.equal(probeAddress(value), '[fd12:3456::4]');
  }
  assert.equal(probeAddress('2001:db8:1:2:3:4:5:6'), '[2001:db8:1:2:3:4:5:6]');
  assert.deepEqual(probePlan(['exp://[2001:db8:1::4]:8081'])?.hosts,
    ['[2001:db8:1::4]', LOOPBACK, LOOPBACK_V6]);
  for (const value of ['fe80::1', '[fe80::1%en0]', 'ff02::1', '::', '::ffff:192.168.1.2',
    'http://user:password@192.168.1.2']) assert.equal(probeAddress(value), undefined, value);
});
