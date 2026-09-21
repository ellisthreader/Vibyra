import assert from 'node:assert/strict';
import test from 'node:test';
import { PICKER_MODEL_IDS, pickerModels } from '../src/ui/pickerModels';
import { brandFor, vendorOf } from '../src/ui/brands';
import { fallbackModels } from '../src/vibes/catalogue';
import type { VibesModel } from '../src/vibes/types';

const model = (id: string, available = true) => ({ id, available }) as VibesModel;
test('old generations, aliases, batch variants and unbranded vendors stay out of the live menu', () => {
  const ids = ['openai/gpt-6-astra', 'openai/gpt-4o', 'anthropic/claude-opus-4.8',
    'google/gemini-3.7-flash', 'openai/gpt-6-astra:batch', '~openai/gpt-astra-latest',
    'new-vendor/brand-new-model', 'z-ai/glm-5'];
  assert.deepEqual(pickerModels(ids.map(id => model(id))).map(m => m.id), ['openai/gpt-6-astra']);
});
test('availability and real company marks are required for every listed model', () => {
  assert.deepEqual(pickerModels([model('openai/gpt-6-astra', false)]), []);
  for (const id of PICKER_MODEL_IDS) {
    const brand = brandFor(vendorOf(id));
    assert.ok(brand.path || brand.paths?.length, `${id} needs a logo, not an initial`);
  }
});
test('curation preserves model metadata and the offline menu offers current trial choices', () => {
  const menu = pickerModels(fallbackModels);
  assert.ok(menu.some(m => m.id === 'qwen/qwen3.8-flash' && m.trial));
  assert.ok(menu.some(m => m.id === 'openai/gpt-6-astra' && !m.trial));
  for (const entry of menu) assert.equal(entry, fallbackModels.find(m => m.id === entry.id));
});
