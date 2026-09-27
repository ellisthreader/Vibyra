import assert from 'node:assert/strict';
import test from 'node:test';
import { hostSnapshot } from '../src/state/hostSnapshot';
import { hostState, runtimeHarness } from './runtimeHarness';
test('session history spans frames without hiding or duplicating existing sessions', async () => {
  const h = runtimeHarness();
  // The authenticated transport shape is exercised by conversation integration;
  // this helper's boundary is the paging protocol and connection epoch.
  h.store.deps.rpc.request = (async (method: string) => method === 'host.state'
    ? { ...hostState, sessions: [hostState.sessions[0]], nextCursor: 'one' }
    : { sessions: hostState.sessions, nextCursor: null }) as typeof h.store.deps.rpc.request;
  const result = await hostSnapshot(h.store, h.store.epoch);
  assert.deepEqual(result.sessions.map(s => s.id), ['one', 'two']);
  assert.equal(result.nextCursor, null);
  h.store.deps.rpc.request = (async () => ({ ...hostState, nextCursor: 'repeat' })) as typeof h.store.deps.rpc.request;
  await assert.rejects(() => hostSnapshot(h.store, h.store.epoch), /too much session history/);
  h.store.dispose();
});
