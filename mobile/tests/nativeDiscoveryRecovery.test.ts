import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeDiscovery } from '../src/connection/nativeDiscoveryRecovery';
import type { DiscoveryUpdate } from '../src/connection/discoveryTypes';

const key = 'ab'.repeat(32);
const otherKey = 'cd'.repeat(32);
const pending = { id: key, name: 'Studio PC', hostId: key, platform: 'windows' };
const reachable = { ...pending, host: '192.168.1.118', port: 4319 };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('only a Bonjour-announced identity can gain an HTTP-recovered address', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  let probes = 0, probeStops = 0, nativeStops = 0;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => { nativeStops++; },
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, listener => { probes++; probeUpdate = listener; return () => { probeStops++; }; },
  update => updates.push(update), 2);
  try {
    nativeUpdate({ status: 'searching', computers: [pending] });
    await delay(8);
    assert.equal(probes, 1);
    probeUpdate({ status: 'searching', computers: [{ ...reachable, id: otherKey, hostId: otherKey }] });
    assert.equal(updates.at(-1)?.computers[0].host, undefined);
    probeUpdate({ status: 'searching', computers: [reachable] });
    assert.equal(updates.at(-1)?.computers[0].host, reachable.host);
    assert.equal(updates.at(-1)?.computers[0].platform, 'windows');
    assert.equal(probeStops, 1);
    nativeUpdate({ status: 'finished', computers: [pending] });
    assert.equal(updates.at(-1)?.computers[0].host, reachable.host);
  } finally { stop(); }
  assert.equal(nativeStops, 1);
  const count = updates.length;
  probeUpdate({ status: 'searching', computers: [reachable] });
  assert.equal(updates.length, count, 'late sweep results cannot revive a dismissed search');
});

test('a native address resolved inside the grace period never starts a sweep', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probes = 0;
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => {},
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, () => { probes++; return () => {}; }, () => {}, 5);
  nativeUpdate({ status: 'searching', computers: [pending] });
  nativeUpdate({ status: 'searching', computers: [reachable] });
  await delay(12);
  assert.equal(probes, 0);
  stop();
});

test('an empty Bonjour search recovers a validated LAN identity and keeps it through a browse gap', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  let probes = 0, probeStops = 0;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => {},
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, listener => { probes++; probeUpdate = listener; return () => { probeStops++; }; },
  update => updates.push(update), 2);
  try {
    nativeUpdate({ status: 'searching', computers: [] });
    await delay(8);
    assert.equal(probes, 1, 'a missing PTR/TXT record still gets a bounded local search');
    probeUpdate({ status: 'searching', computers: [{ ...reachable, id: otherKey }] });
    assert.equal(updates.at(-1)?.computers.length, 0, 'identity and public key must agree');
    probeUpdate({ status: 'searching', computers: [reachable] });
    assert.deepEqual(updates.at(-1)?.computers, [reachable]);
    nativeUpdate({ status: 'finished', computers: [] });
    assert.equal(updates.at(-1)?.status, 'searching', 'the probe has time to finish');
    assert.deepEqual(updates.at(-1)?.computers, [reachable]);
    probeUpdate({ status: 'finished', computers: [reachable] });
    assert.equal(updates.at(-1)?.status, 'finished');
    assert.equal(probeStops, 1);
  } finally { stop(); }
  assert.equal(probeStops, 1);
});

test('explicit Local Network denial stops fallback and discards untrusted candidates', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  let probes = 0, probeStops = 0;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => {},
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, listener => { probes++; probeUpdate = listener; return () => { probeStops++; }; },
  update => updates.push(update), 2);
  try {
    nativeUpdate({ status: 'searching', computers: [] });
    await delay(8);
    probeUpdate({ status: 'searching', computers: [reachable] });
    nativeUpdate({ status: 'denied', computers: [] });
    assert.equal(probeStops, 1);
    assert.deepEqual(updates.at(-1), { status: 'denied', computers: [] });
    probeUpdate({ status: 'searching', computers: [reachable] });
    assert.deepEqual(updates.at(-1), { status: 'denied', computers: [] });
  } finally { stop(); }
  assert.equal(probes, 1);
});

test('a failed native start still tries the LAN, unless iOS already denied access', async () => {
  for (const denied of [false, true]) {
    let nativeUpdate!: (update: DiscoveryUpdate) => void;
    let probeUpdate!: (update: DiscoveryUpdate) => void;
    let probes = 0;
    const updates: DiscoveryUpdate[] = [];
    const stop = startNativeDiscovery({
      start: async () => { throw new Error('browser failed'); }, stop: async () => {},
      addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
    }, listener => { probes++; probeUpdate = listener; return () => {}; },
    update => updates.push(update), 2);
    try {
      if (denied) nativeUpdate({ status: 'denied', computers: [] });
      await delay(8);
      assert.equal(probes, denied ? 0 : 1);
      if (!denied) {
        probeUpdate({ status: 'searching', computers: [reachable] });
        assert.deepEqual(updates.at(-1)?.computers, [reachable]);
      } else assert.equal(updates.at(-1)?.status, 'denied');
    } finally { stop(); }
  }
});

test('an empty search ends when the bounded probe is exhausted, then accepts a later native answer', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => {},
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, listener => { probeUpdate = listener; return () => {}; },
  update => updates.push(update), 2);
  try {
    nativeUpdate({ status: 'searching', computers: [] });
    await delay(8);
    probeUpdate({ status: 'finished', computers: [] });
    assert.deepEqual(updates.at(-1), { status: 'finished', computers: [] });
    nativeUpdate({ status: 'searching', computers: [reachable] });
    assert.equal(updates.at(-1)?.status, 'searching');
    assert.deepEqual(updates.at(-1)?.computers, [reachable]);
  } finally { stop(); }
});
