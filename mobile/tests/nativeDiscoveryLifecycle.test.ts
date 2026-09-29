import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeDiscovery } from '../src/connection/nativeDiscoveryRecovery';
import type { DiscoveryUpdate } from '../src/connection/discoveryTypes';

const key = 'ab'.repeat(32);
const pending = { id: key, name: 'Studio PC', hostId: key, platform: 'windows' };
const reachable = { ...pending, host: '192.168.1.118', port: 4319 };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('a native start that never settles or emits still starts bounded recovery', async () => {
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  let probes = 0;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: () => new Promise<void>(() => {}), stop: async () => {},
    addListener() { return { remove() {} }; },
  }, listener => { probes++; probeUpdate = listener; return () => {}; },
  update => updates.push(update), 2);
  try {
    await delay(8);
    assert.equal(probes, 1);
    probeUpdate({ status: 'searching', computers: [reachable] });
    assert.deepEqual(updates.at(-1)?.computers, [reachable]);
  } finally { stop(); }
});

test('a synchronous probe completion cancels its disposer; a failed probe start still ends search', async () => {
  for (const throws of [false, true]) {
    let nativeUpdate!: (update: DiscoveryUpdate) => void;
    let stops = 0;
    const updates: DiscoveryUpdate[] = [];
    const stop = startNativeDiscovery({
      start: async () => {}, stop: async () => {},
      addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
    }, listener => {
      if (throws) throw new Error('probe setup failed');
      listener({ status: 'finished', computers: [] });
      return () => { stops++; };
    }, update => updates.push(update), 2);
    try {
      nativeUpdate({ status: 'searching', computers: [] });
      await delay(8);
      assert.deepEqual(updates.at(-1), { status: 'finished', computers: [] });
      assert.equal(stops, throws ? 0 : 1);
    } finally { stop(); }
    assert.equal(stops, throws ? 0 : 1);
  }
});

test('native identity supersedes a recovered endpoint for the same key', async () => {
  let nativeUpdate!: (update: DiscoveryUpdate) => void;
  let probeUpdate!: (update: DiscoveryUpdate) => void;
  const updates: DiscoveryUpdate[] = [];
  const stop = startNativeDiscovery({
    start: async () => {}, stop: async () => {},
    addListener(_event, listener) { nativeUpdate = listener; return { remove() {} }; },
  }, listener => { probeUpdate = listener; return () => {}; },
  update => updates.push(update), 2);
  try {
    nativeUpdate({ status: 'searching', computers: [pending] });
    await delay(8);
    probeUpdate({ status: 'searching', computers: [reachable] });
    nativeUpdate({ status: 'searching', computers: [{ ...reachable, host: '192.168.1.119' }] });
    assert.equal(updates.at(-1)?.computers[0].host, '192.168.1.119');
    assert.equal(updates.at(-1)?.computers.length, 1);
  } finally { stop(); }
});
