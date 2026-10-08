import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoverySession } from '../src/connection/discoverySession';
import type { DiscoveryUpdate } from '../src/connection/discoveryTypes';

test('discovery needs an explicit start; dismissing fences late results and retry disposes the prior search', () => {
  const callbacks: ((value: DiscoveryUpdate) => void)[] = [];
  const updates: DiscoveryUpdate[] = [];
  let stops = 0;
  const session = createDiscoverySession({ available: true,
    start(callback) { callbacks.push(callback); return () => { stops++; }; },
  }, value => updates.push(value));
  assert.equal(callbacks.length, 0, 'mounting cannot ask iOS for access');
  session.start();
  callbacks[0]({ status: 'denied', computers: [] });
  assert.equal(updates.at(-1)?.status, 'denied');
  session.start();
  assert.equal(stops, 1);
  callbacks[0]({ status: 'finished', computers: [{ id: 'stale', name: 'Old computer' }] });
  assert.equal(updates.at(-1)?.status, 'searching');
  callbacks[1]({ status: 'searching', computers: [{ id: 'current', name: 'My computer' }] });
  assert.equal(updates.at(-1)?.computers[0].id, 'current');
  session.stop();
  const count = updates.length;
  callbacks[1]({ status: 'failed', computers: [] });
  assert.equal(updates.length, count);
  assert.equal(stops, 2);
});

test('unsupported clients never pretend to scan', () => {
  let called = false;
  const updates: DiscoveryUpdate[] = [];
  const session = createDiscoverySession({ available: false,
    start() { called = true; return () => {}; },
  }, value => updates.push(value));
  session.start();
  assert.equal(called, false);
  assert.deepEqual(updates, [{ status: 'unavailable', computers: [] }]);
});
