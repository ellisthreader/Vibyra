import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeNotificationResponses } from '../src/lib/nativeNotificationResponses.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
const activation = (id, account = 'owner') => ({ id, account, agentId: 'agent-'+id, runId: 'run-'+id });

test('only actual native queue entries open exact tasks; event payload and window focus cannot choose a route', async () => {
  let wake, queue = [], calls = 0; const opened = [];
  const stop = await startNativeNotificationResponses({ listen: async callback => { wake = callback; return () => {}; },
    drain: async () => { calls++; const result = queue; queue = []; return result; }, account: () => 'owner', open: item => opened.push(item) });
  await tick(); assert.equal(opened.length, 0);
  wake({ agentId: 'forged' }); await tick(); assert.equal(opened.length, 0);
  queue = [activation('second'), activation('first')]; wake(); await tick();
  assert.deepEqual(opened.map(item => item.runId), ['run-second','run-first']);
  queue = [activation('second')]; wake(); await tick(); assert.equal(opened.length, 2);
  stop(); queue = [activation('third')]; wake(); await tick(); assert.equal(opened.length, 2);
  assert.ok(calls >= 3);
});

test('cold-start click drains after listener registration and is owner scoped', async () => {
  const opened = [];
  const stop = await startNativeNotificationResponses({ listen: async () => () => {}, drain: async () => [activation('old','other'), activation('cold')],
    account: () => 'owner', open: item => opened.push(item) });
  await tick(); stop(); assert.deepEqual(opened.map(item => item.id), ['cold']);
});

test('an account switch during native drain cannot navigate', async () => {
  let account = 'old', finish; const opened = [];
  const stop = await startNativeNotificationResponses({ listen: async () => () => {}, drain: () => new Promise(resolve => { finish = resolve; }),
    account: () => account, open: item => opened.push(item) });
  account = 'new'; finish([activation('old','old')]); await tick(); stop();
  assert.deepEqual(opened, []);
});
