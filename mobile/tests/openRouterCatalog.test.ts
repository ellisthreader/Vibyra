import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOpenRouterCatalog } from '../src/vibes/openRouterCatalog';

test('public discovery preserves the full text catalogue and cannot authorize paid launches', () => {
  const data = Array.from({ length: 458 }, (_, i) => ({ id: `company-${i % 63}/model-${i}:free`, name: `Model ${i}`,
    architecture: { output_modalities: ['text', 'image'] }, supported_parameters: ['tools'] }));
  const models = parseOpenRouterCatalog({ data: [...data, { id: 'image/only', name: 'Image', architecture: { output_modalities: ['image'] } }, null] });
  assert.equal(models.length, 458);
  assert.equal(new Set(models.map(m => m.family)).size, 63);
  assert.equal(models.at(-1)?.id, 'company-16/model-457:free');
  assert.ok(models.every(m => m.source === 'vibyra' && !m.available && m.tools && m.inputPerMillion === null));
});

test('an invalid catalogue fails visibly instead of becoming an empty successful result', () => {
  assert.throws(() => parseOpenRouterCatalog({ error: 'offline' }), /could not be read/);
  assert.throws(() => parseOpenRouterCatalog({ data: [{ id: 'bad' }] }), /No chat or code/);
});
