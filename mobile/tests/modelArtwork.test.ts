import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { modelArtworkKey } from '../src/ui/modelArtworkKey';
import { fallbackModels } from '../src/vibes/catalogue';
import { groupCompanies } from '../src/ui/modelGroups';

test('a model resolves to its own generated artwork', () => {
  assert.equal(modelArtworkKey('anthropic/claude-opus-5'), 'claude-opus-5');
  assert.equal(modelArtworkKey('openai/gpt-5.6-luna'), 'gpt-5.6-luna');
  assert.equal(modelArtworkKey('google/gemini-3.8-pro'), 'gemini-3.8-pro');
  assert.equal(modelArtworkKey('openai/gpt-6-astra'), 'gpt-6-astra');
});
test('a model never wears a sibling’s version number', () => {
  // The match is exact, so none of these can borrow the shorter name's tile.
  assert.equal(modelArtworkKey('openai/gpt-5.4'), 'gpt-5.4');
  assert.equal(modelArtworkKey('openai/gpt-5.4-mini'), 'gpt-5.4-mini');
  assert.equal(modelArtworkKey('anthropic/claude-opus-4.7-fast'), 'claude-opus-4.7-fast');
  assert.equal(modelArtworkKey('anthropic/claude-opus-4.7'), 'claude-opus-4.7');
  assert.equal(modelArtworkKey('gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
  // Fable 5.1 has no tile of its own, and Fable 5's would read "5" on it.
  assert.equal(modelArtworkKey('anthropic/claude-fable-5.1'), null);
});
test('a model with no artwork falls back rather than guessing', () => {
  assert.equal(modelArtworkKey('qwen/qwen3-coder'), null);
  assert.equal(modelArtworkKey('google/gemini-4.0-pro'), null);
  assert.equal(modelArtworkKey(''), null);
});
test('a provider suffix never hides the artwork', () => {
  assert.equal(modelArtworkKey('openai/gpt-5.5:free'), 'gpt-5.5');
  assert.equal(modelArtworkKey('OpenAI/GPT-5.5'), 'gpt-5.5');
});
test('every artwork key names a file that is actually bundled', async () => {
  // The mapping and the assets are edited apart, so a rename must fail loudly
  // here rather than render an empty tile on someone's phone.
  const files = new Set((await readdir('assets/model-icons')).map(name => name.replace(/\.png$/, '')));
  const keys = fallbackModels.map(model => modelArtworkKey(model.id)).filter(Boolean);
  assert.ok(keys.length >= 15, `The shipped catalogue should reach the artwork, matched ${keys.length}`);
  for (const key of keys) assert.ok(files.has(key!), `${key}.png is missing from assets/model-icons`);
});
test('every OpenAI, Anthropic and Google model on offer has its own tile', () => {
  // These three are the families the artwork set covers, and a company mark
  // standing in for a flagship is what this is meant to catch.
  const missing = groupCompanies(fallbackModels)
    .filter(company => ['openai', 'anthropic', 'google'].includes(company.vendor))
    .flatMap(company => company.models)
    .filter(model => !modelArtworkKey(model.id))
    .map(model => model.id);
  // Fable 5.1 has no tile of its own — Fable 5's would read "5" on it.
  assert.deepEqual(missing, ['anthropic/claude-fable-5.1'],
    'Only the models knowingly left without artwork may fall back');
});
