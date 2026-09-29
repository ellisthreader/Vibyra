import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundedCompanies, terminalCatalogModels } from '../src/ui/terminalCatalogPresentation';
import type { FundedModel } from '../src/vibes/types';

const model = (id: string, name: string, created = 1): FundedModel => ({ id, name, created,
  family: id.split('/')[0], source: 'vibyra', tools: true, available: true, trial: false,
  inputPerMillion: 1, outputPerMillion: 1 });
test('batch and duplicate aliases disappear while unique models retain exact IDs', () => {
  const models = [model('openai/gpt-6', 'OpenAI: GPT-6'), model('openai/gpt-6:batch', 'OpenAI: GPT-6 (batch)'),
    model('~openai/gpt-6', 'GPT-6'), model('anthropic/claude:batch', 'Claude'),
    model('anthropic/claude', 'Claude'), model('novel/unique:free', 'Unique'), model('~novel/alias-only', 'Alias only')];
  const ids = terminalCatalogModels(models).map(m => m.id);
  assert.equal(ids.length, 4);
  assert.ok(ids.includes('novel/unique:free') && ids.includes('~novel/alias-only'));
  assert.ok(!ids.some(id => id.includes('batch')));
});
test('familiar companies lead, lesser-known companies remain searchable, and newer models come first', () => {
  const groups = fundedCompanies([model('aion-labs/new', 'AionLabs: New'), model('deepseek/latest', 'DeepSeek'),
    model('openai/older', 'OpenAI: Older', 10), model('openai/newer', 'OpenAI: Newer', 20)]);
  assert.deepEqual(groups.map(g => g.vendor), ['openai', 'deepseek', 'aion-labs']);
  assert.equal(groups[2].section, 'More companies');
  assert.equal(groups[0].models[0].name, 'Newer');
  assert.equal(groups[0].models[0].id, 'openai/newer');
});
