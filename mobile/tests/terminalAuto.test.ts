import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalCandidates, verifyTerminalDecision } from '../src/vibes/terminalDecision';
import { parseOpenRouterCatalog } from '../src/vibes/openRouterCatalog';
import { terminalCatalogModels } from '../src/ui/terminalCatalogPresentation';
import { CreateRequests } from '../src/state/createRequest';

test('router rows cannot become terminal choices even with text output or cached catalogues', () => {
  const rows = ['typesafe/jev-router', '~typesafe/jev-latest', 'typesafe/jev-1.13', 'openrouter/auto', 'openrouter/free', 'openai/code'].map(id => ({
    id, name: id, architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'],
  }));
  assert.deepEqual(parseOpenRouterCatalog({ data: rows }).map(m => m.id), ['openai/code']);
  assert.deepEqual(terminalCatalogModels(rows as never).map(m => m.id), ['openai/code']);
});
test('Auto returns only an eligible exact model and supported effort', () => {
  const candidates = terminalCandidates([{ id: 'openai/code', name: 'Code', efforts: ['low', 'high', 'ultra'] }]);
  assert.deepEqual(candidates[0].efforts, ['low', 'high']);
  assert.equal(verifyTerminalDecision({ model: 'openai/code', name: 'Code', effort: 'high' }, candidates).effort, 'high');
  assert.throws(() => verifyTerminalDecision({ model: 'typesafe/jev-router', name: 'Router', effort: null }, candidates));
  assert.throws(() => verifyTerminalDecision({ model: 'openai/code', name: 'Code', effort: 'max' }, candidates));
});
test('bounded Auto candidate set retains each company before filling variants', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `a/model-${i}`, name: `${i}` }));
  rows.push({ id: 'b/model', name: 'B' });
  const candidates = terminalCandidates(rows);
  assert.equal(candidates.length, 64);
  assert.ok(candidates.some(m => m.id === 'b/model'));
});
test('large candidate sets balance company variants and use trusted display names', () => {
  const rows = ['a', 'b', 'c', 'd'].flatMap(company => Array.from({ length: 100 }, (_, i) => ({ id: `${company}/${i}`, name: `${company} ${i}`, efforts: ['high'] })));
  const candidates = terminalCandidates(rows);
  for (const company of ['a', 'b', 'c', 'd']) assert.equal(candidates.filter(m => m.id.startsWith(`${company}/`)).length, 16);
  assert.equal(verifyTerminalDecision({ model: 'a/0', name: 'Untrusted label', effort: 'high' }, candidates).name, 'a 0');
  for (const value of [null, {}, { model: 'a/0', name: 'A', effort: null }, { model: 'a/0', name: 'A', effort: 'ultra' }])
    assert.throws(() => verifyTerminalDecision(value, candidates));
  assert.equal(verifyTerminalDecision({ model: 'plain/model', name: 'Plain', effort: null }, [{ id: 'plain/model', name: 'Plain', efforts: [] }]).effort, null);
});
test('native launch retries distinguish effort, including no-effort choice', () => {
  const requests = new CreateRequests(() => 'id');
  const key = (effort?: string | null) => requests.key('host', 'project', 'codex', 'Task', false, 'openai/code', 'standard', effort);
  assert.notEqual(key('high'), key('low'));
  assert.notEqual(key(null), key());
});
