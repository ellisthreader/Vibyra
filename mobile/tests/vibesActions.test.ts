import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vibesActions } from '../src/state/vibesActions';
import type { WorkspaceStore } from '../src/state/WorkspaceStore';
function setup(token: string | null = null) {
  const calls: unknown[] = [];
  const state = { status: 'connected', vibesToolsAvailable: true, host: { id: 'mac' }, projects: [{ id: 'vault' }] };
  const store = { epoch: 1, token, state, assertCurrent(epoch: number) { assert.equal(epoch, this.epoch); },
    deps: { rpc: { async request(method: string, params: object) { calls.push({ method, params }); return { binding: 'bound' }; } } } };
  return { store, request: vibesActions(store as unknown as WorkspaceStore).vibesProjectRequest!, calls };
}
const params = { hostId: 'mac', projectId: 'vault', accountToken: 'guest-wallet', chatId: 'chat' };
test('a paired guest uses the Vibes wallet without unrelated desktop account login', async () => {
  const { request, calls } = setup();
  assert.deepEqual(await request('vibes.bind', params), { binding: 'bound' });
  assert.equal(calls.length, 1);
});
test('missing wallet, wrong project, disconnected and unsupported hosts never send a request', async () => {
  const { store, request, calls } = setup();
  await assert.rejects(request('vibes.bind', { ...params, accountToken: '' }));
  await assert.rejects(request('vibes.bind', { ...params, projectId: 'other' }));
  await assert.rejects(request('vibes.bind', { ...params, hostId: 'other' }));
  store.state.status = 'offline'; await assert.rejects(request('vibes.bind', params));
  store.state.status = 'connected'; store.state.vibesToolsAvailable = false;
  await assert.rejects(request('vibes.bind', params));
  assert.equal(calls.length, 0);
});
test('account and connection changes invalidate an in-flight result', async () => {
  for (const change of ['account', 'connection']) {
    const { store, request } = setup();
    store.deps.rpc.request = async () => {
      if (change === 'account') store.token = 'new-account'; else store.epoch += 1;
      return { binding: 'stale' };
    };
    await assert.rejects(request('vibes.bind', params));
  }
});
