import assert from 'node:assert/strict';
import test from 'node:test';
import { asEffort, effortLabel, efforts, normalizeReasoning, resolveEffort, supportsEffort } from '../src/ui/effort';
import type { VibesModel } from '../src/vibes/types';

const model = (raw: unknown): VibesModel => ({ id: 'vendor/model', name: 'Model', family: 'Vendor', trial: false,
  available: true, inputPerMillion: null, outputPerMillion: null, reasoning: normalizeReasoning(raw) });

test('the ladder is ascending, so a picker reads cheapest to deepest', () => {
  assert.deepEqual(efforts, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
});
// The three shapes below are all present in the live OpenRouter catalogue and
// they do not mean the same thing.
test('a missing supported_efforts key offers no ladder', () => {
  // 143 live models look like this: reasoning is a switch, not a dial.
  assert.deepEqual(normalizeReasoning({ mandatory: false, default_enabled: true }).efforts, []);
  assert.deepEqual(normalizeReasoning(undefined).efforts, []);
  assert.deepEqual(normalizeReasoning(null).efforts, []);
});
test('an explicit null accepts every level', () => {
  assert.deepEqual(normalizeReasoning({ supported_efforts: null }).efforts, efforts);
});
test('a published ladder is sorted ascending and junk entries are dropped', () => {
  // OpenRouter reports highest-first; the picker needs the reverse.
  const claude = normalizeReasoning({ mandatory: true, default_effort: 'high',
    supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'] });
  assert.deepEqual(claude.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(claude.defaultEffort, 'high');
  assert.equal(claude.mandatory, true);
  assert.deepEqual(normalizeReasoning({ supported_efforts: ['high', 7, 'nonsense', 'low'] }).efforts, ['low', 'high']);
});
test('a mandatory reasoner never offers None', () => {
  const raw = { supported_efforts: ['high', 'medium', 'low', 'none'] };
  assert.ok(normalizeReasoning(raw).efforts.includes('none'));
  assert.ok(!normalizeReasoning({ ...raw, mandatory: true }).efforts.includes('none'));
});
test('an unknown default_effort is not offered as the default', () => {
  assert.equal(normalizeReasoning({ supported_efforts: ['high', 'low'], default_effort: 'max' }).defaultEffort, null);
  assert.equal(normalizeReasoning({ supported_efforts: ['high', 'low'], default_effort: 42 }).defaultEffort, null);
});
test('a single-rung ladder is not a choice worth showing', () => {
  assert.equal(supportsEffort(model({ supported_efforts: ['high'] })), false);
  assert.equal(supportsEffort(model({ supported_efforts: ['high', 'low'] })), true);
  assert.equal(supportsEffort(undefined), false);
});
test('a supported choice survives a model change', () => {
  const fable = model({ mandatory: true, default_effort: 'high', supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'] });
  assert.equal(resolveEffort(fable, 'xhigh'), 'xhigh');
});
test('an unsupported choice falls back to the model’s own published default', () => {
  const gemini = model({ mandatory: true, default_effort: 'medium', supported_efforts: ['high', 'medium', 'low'] });
  assert.equal(resolveEffort(gemini, 'xhigh'), 'medium');
});
test('with no usable default the nearest supported rung keeps the intent', () => {
  // Kimi K3 publishes max/high/low with no default; asking for xhigh must not drop to low.
  const kimi = model({ supported_efforts: ['max', 'high', 'low'], default_effort: 'unknown' });
  assert.equal(resolveEffort(kimi, 'minimal'), 'low');
  // medium and xhigh each sit equidistant between two rungs, and a tie must not
  // cost more than the level that was actually asked for.
  assert.equal(resolveEffort(kimi, 'medium'), 'low');
  assert.equal(resolveEffort(kimi, 'xhigh'), 'high');
});
test('a model that cannot be steered resolves to no effort at all', () => {
  assert.equal(resolveEffort(model({ mandatory: false, default_enabled: true }), 'high'), null);
  assert.equal(resolveEffort(undefined, 'high'), null);
});
test('a first opening lands on the published default, else mid-ladder', () => {
  assert.equal(resolveEffort(model({ supported_efforts: ['max', 'high', 'low'], default_effort: 'max' }), null), 'max');
  assert.equal(resolveEffort(model({ supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'] }), null), 'high');
});
test('stored and networked values are guarded', () => {
  assert.equal(asEffort('xhigh'), 'xhigh');
  assert.equal(asEffort('ultracode'), null, 'a desktop CLI mode is not an OpenRouter effort');
  assert.equal(asEffort(null), null); assert.equal(asEffort(7), null);
});
test('an absent effort reads as the provider default', () => {
  assert.equal(effortLabel(null), 'Default'); assert.equal(effortLabel('xhigh'), 'X-high');
});
