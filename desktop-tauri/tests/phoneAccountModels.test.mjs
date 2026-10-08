import test from 'node:test';
import assert from 'node:assert/strict';
import { accountModelFor } from '../src/lib/phoneAccountModels.ts';
import { phoneTerminalModels } from '../src/lib/phoneTerminalModels.ts';
import { STATIC_GROUPS } from '../src/lib/staticModels.ts';
const rows = [
  { model: 'opus', resolvedModel: 'claude-opus-5-5', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] },
  { model: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', supportedReasoningEfforts: [{ reasoningEffort: 'none' }] },
];
test('account matching handles dated Haiku and dots, without substituting versions', () => {
  assert.equal(accountModelFor('anthropic/claude-haiku-4.5', rows)?.model, 'haiku');
  assert.equal(accountModelFor('claude-opus-5.5', rows)?.model, 'opus');
  assert.equal(accountModelFor('claude-opus-4-5', rows), undefined);
  assert.equal(accountModelFor('claude-haiku-4-5', [...rows, { model: 'other', resolvedModel: 'claude-haiku-4-5-20261001' }]), undefined);
});
test('phone Claude catalogue only advertises actual account models and effort levels', () => {
  const result = phoneTerminalModels(STATIC_GROUPS, [{ id: 'claude', installed: true }], ['claude'], { claude: rows });
  assert.deepEqual(result.map(row => row.id).sort(), ['anthropic/claude-haiku-4.5', 'anthropic/claude-opus-5.5']);
  assert.deepEqual(result.find(row => row.id.includes('opus')).efforts, ['low', 'high']);
  assert.equal(result.find(row => row.id.includes('haiku')).effort, null);
  assert.equal(result.find(row => row.id.includes('haiku')).model, 'claude-haiku-4-5');
});

test('Codex Auto cannot receive catalogue-only models rejected by its account', () => {
  const result = phoneTerminalModels(STATIC_GROUPS, [{ id: 'codex', installed: true }], ['codex'], {
    codex: [{ model: 'gpt-6-sol', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }],
  });
  assert.deepEqual(result.map(row => row.id), ['openai/gpt-6-sol']);
  assert.deepEqual(result[0].efforts, ['medium']);
});
