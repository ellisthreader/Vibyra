import assert from 'node:assert/strict';
import test from 'node:test';
import { VibesStore } from '../src/vibes/VibesStore';
import { VibesError } from '../src/vibes/api';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import type { VibesApi, VibesTurn } from '../src/vibes/types';

const running: VibesTurn = { id: 'turn', chatId: 'chat', model: 'auto', status: 'running', prompt: 'Hello',
  response: null, error: null, reserved: 2, charged: 0, createdAt: '2026-09-12' };
function fixture(api: Partial<VibesApi> = {}, saved = '') {
  return new VibesStore({ ...sampleVibesApi, chats: async () => [], turns: async () => [], ...api }, () => 'turn',
    { read: async () => saved, write: async value => { saved = value; } });
}

test('a restored Auto choice loses stale effort even when the live catalogue fails', async () => {
  const store = fixture({ models: async () => { throw new Error('offline'); } }, JSON.stringify({ model: 'auto', effort: 'max' }));
  await store.initialize();
  assert.equal(store.state.effort, null);
});

test('an active chat opened without a locally pending ID continues polling', async () => {
  const store = fixture({ turns: async () => [running] });
  await store.initialize(); await store.select('chat');
  assert.equal(store.state.pending, null);
  assert.equal(store.needsPolling, true);
  store.update({ turns: [{ ...running, status: 'completed' }] });
  assert.equal(store.needsPolling, false);
});

test('failed persistence before dispatch cannot strand a pending send or reach the server', async () => {
  let calls = 0;
  const store = new VibesStore({ ...sampleVibesApi, submit: async () => { calls++; return running; } }, () => 'turn',
    { read: async () => null, write: async () => { throw new Error('Storage unavailable'); } });
  store.update({ ready: true });
  assert.equal(await store.send('quote'), false);
  assert.equal(calls, 0);
  assert.equal(store.state.pending, null);
  assert.equal(store.state.error, 'Storage unavailable');
});

test('a missing submit route is a refusal, not an indefinitely pending turn', async () => {
  for (const status of [404, 405]) {
    const store = fixture({ submit: async () => { throw new VibesError('Not available yet', status); } });
    await store.initialize();
    assert.equal(await store.send('quote'), false);
    assert.equal(store.state.pending, null);
  }
});

test('Refresh advances the quote revision even when the wallet values are unchanged', async () => {
  const store = fixture(); await store.initialize();
  const before = store.state.revision;
  await store.refresh();
  assert.ok(store.state.revision > before);
});

test('unsupported effort is reconciled before it can be persisted and sent', async () => {
  const store = fixture({ models: async () => [{ id: 'test/model', name: 'Test', family: 'Test', trial: true,
    available: true, inputPerMillion: 1, outputPerMillion: 1,
    reasoning: { efforts: ['low', 'high'], defaultEffort: 'low', mandatory: true } }] });
  await store.initialize(); store.setModel('test/model'); store.setEffort('max');
  assert.equal(store.state.effort, 'low');
});
