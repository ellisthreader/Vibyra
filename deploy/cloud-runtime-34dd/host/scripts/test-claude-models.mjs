import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../provider-bridge/claude.cjs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const match = vm.runInContext('claudeModelFor', context);
test('executable Claude bridge resolves dated account aliases without guessing another model', () => {
  const rows = [{ model: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }, { model: 'opus', resolvedModel: 'claude-opus-5-5' }];
  assert.equal(match('claude-haiku-4-5', rows)?.model, 'haiku');
  assert.equal(match('claude-opus-5.5', rows)?.model, 'opus');
  assert.equal(match('claude-haiku-4-5-20251001', rows)?.model, 'haiku');
  assert.equal(match('claude-opus-4-5', rows), undefined);
  assert.equal(match('claude-haiku-4-5', [...rows, { model: 'another', resolvedModel: 'claude-haiku-4-5-20261001' }]), undefined);
});
