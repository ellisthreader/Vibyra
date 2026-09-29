import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundedApi } from '../src/vibes/fundedApi';

test('all pages retain exact model IDs and pin the catalogue snapshot', async () => {
  const paths: string[] = [];
  const api = fundedApi(async path => {
    paths.push(path);
    const page = Number(new URL('http://fixture/' + path).searchParams.get('page'));
    return { version: 1, source: 'vibyra', revision: 'snapshot', next: page < 5 ? page + 1 : null,
      models: Array.from({ length: 100 }, (_, i) => ({ id: `vendor/model-${page * 100 + i}:free`, name: 'Model', source: 'vibyra', tools: false, available: true })) };
  });
  const models = await api.terminalModels!();
  assert.equal(models.length, 500);
  assert.equal(models.at(-1)?.id, 'vendor/model-599:free');
  assert.ok(paths.slice(1).every(path => path.includes('&revision=snapshot')));
});

test('mixed snapshots and malformed source/capability responses never become a partial catalogue', async () => {
  let calls = 0;
  const api = fundedApi(async () => ({ version: 1, source: 'vibyra', revision: ++calls === 1 ? 'one' : 'two',
    next: calls === 1 ? 2 : null, models: [] }));
  await assert.rejects(api.terminalModels!, /changed/);
  for (const bad of [{ id: 'model', name: 'Model', available: true, source: 'accounts', tools: true }, { id: 'model' }]) {
    await assert.rejects(fundedApi(async () => ({ version: 1, source: 'vibyra', revision: 'one', next: null, models: [bad] })).terminalModels!);
  }
});

test('a create response cannot redirect the selected model or project', async () => {
  const api = fundedApi(async () => ({ session: { id: 'id', terminal_model: 'other', host_id: 'host', project_id: 'project' } }));
  await assert.rejects(() => api.createTerminal!({ id: 'id', source: 'vibyra', tools: true, model: 'chosen', hostId: 'host', projectId: 'project', binding: 'binding', title: 'Terminal', budget: 10 }));
});
