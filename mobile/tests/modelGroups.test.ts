import assert from 'node:assert/strict';
import test from 'node:test';
import { compareModels, groupCompanies, isNew, matches, releasedAt } from '../src/ui/modelGroups';
import { brandFor, vendorOf } from '../src/ui/brands';
import { normalizeModel, normalizeModels } from '../src/vibes/api';
import { fallbackModels } from '../src/vibes/catalogue';
import type { VibesModel } from '../src/vibes/types';

const NOW = Date.parse('2026-09-09T00:00:00Z');
const days = (n: number) => Math.floor((NOW - n * 86400_000) / 1000);
const model = (id: string, extra: Partial<VibesModel> = {}): VibesModel => ({ id, name: id.split('/')[1],
  family: 'X', trial: false, available: true, inputPerMillion: null, outputPerMillion: null, ...extra });

test('one maker is one company however many slugs it publishes under', () => {
  // The live catalogue ships meta beside meta-llama and an alias with a leading ~.
  assert.equal(vendorOf('meta/muse-1'), 'meta-llama');
  assert.equal(vendorOf('meta-llama/llama-4'), 'meta-llama');
  assert.equal(vendorOf('~anthropic/claude-opus-latest'), 'anthropic');
  assert.equal(vendorOf('bytedance-seed/seed-2'), 'bytedance');
  const groups = groupCompanies([model('meta/muse-1'), model('meta-llama/llama-4')], NOW);
  assert.equal(groups.length, 1, 'Meta must not appear twice');
  assert.equal(groups[0].models.length, 2);
});
test('every vendor gets a readable name, never a raw slug', () => {
  assert.equal(brandFor('bytedance').name, 'ByteDance');
  assert.equal(brandFor('x-ai').name, 'xAI');
  assert.equal(brandFor('nousresearch').name, 'Nous Research');
  // An unknown vendor is title-cased rather than dropped.
  assert.equal(brandFor('brand-new-lab').name, 'Brand New Lab');
});
test('the companies people look for lead, and the rest sort on what they offer', () => {
  const groups = groupCompanies([model('ai21/jamba'), model('qwen/a'), model('qwen/b'),
    model('openai/gpt'), model('tinyshop/one'), model('anthropic/opus')], NOW);
  assert.deepEqual(groups.map(g => g.vendor).slice(0, 4), ['openai', 'anthropic', 'qwen', 'ai21']);
  // Unranked vendors are never dropped; the bigger one simply comes first.
  assert.deepEqual(groups.map(g => g.vendor).slice(4), ['tinyshop']);
});
test('no company is dropped for being unfamiliar', () => {
  const exotic = ['undi95/toppy', 'gryphe/mythomax', 'sakana/model', 'poolside/code'].map(id => model(id));
  assert.equal(groupCompanies(exotic, NOW).length, 4);
});
test('curated models lead their company, then newest first', () => {
  const list = [model('openai/old', { created: days(400) }), model('openai/fresh', { created: days(2) }),
    model('openai/curated', { tier: 'best', released: '2020-01-01' })];
  assert.deepEqual([...list].sort(compareModels).map(m => m.name), ['curated', 'fresh', 'old']);
});
test('New reads either the curated date or OpenRouter’s epoch', () => {
  assert.equal(isNew(model('a/b', { created: days(3) }), NOW), true);
  assert.equal(isNew(model('a/b', { released: '2026-09-06' }), NOW), true);
  assert.equal(isNew(model('a/b'), NOW), false, 'No date is not new');
  // The newer of the two wins, so a dated snapshot is not aged by its family date.
  assert.equal(isNew(model('a/b', { released: '2026-04-24', created: days(5) }), NOW), true);
});
test('New means the last seven days and nothing looser', () => {
  // A badge most of the catalogue wears tells nobody anything, which is what a
  // wider window produced: every second company led with "New".
  assert.equal(isNew(model('a/b', { created: days(6) }), NOW), true);
  assert.equal(isNew(model('a/b', { created: days(8) }), NOW), false);
  assert.equal(isNew(model('a/b', { created: days(40) }), NOW), false);
  assert.equal(isNew(model('a/b', { created: days(200) }), NOW), false);
});
test('a future timestamp is never badged New', () => {
  // One bad value would otherwise mark a model new forever.
  assert.equal(isNew(model('a/b', { created: days(-30) }), NOW), false);
  assert.equal(releasedAt(model('a/b', { created: 0 })), 0);
});
test('a company counts its own new models', () => {
  const groups = groupCompanies([model('openai/a', { created: days(1) }),
    model('openai/b', { created: days(900) })], NOW);
  assert.equal(groups[0].newCount, 1);
});
test('search finds a model by its company, its name or its slug', () => {
  const opus = model('anthropic/claude-opus-5', { name: 'Opus 5' });
  assert.ok(matches(opus, 'anthropic'));
  assert.ok(matches(opus, 'opus'));
  assert.ok(matches(opus, 'claude-opus'));
  assert.ok(!matches(opus, 'gemini'));
});
// The one boundary where OpenRouter's own shape actually arrives.
test('a raw backend payload still yields a usable ladder', () => {
  const normalized = normalizeModel({ id: 'anthropic/claude-fable-5.1', name: 'Fable 5.1',
    reasoning: { mandatory: true, default_effort: 'high', supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'] } });
  assert.deepEqual(normalized.reasoning?.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(normalized.reasoning?.defaultEffort, 'high');
});
test('an already normalized payload is passed through untouched', () => {
  const normalized = normalizeModel({ id: 'a/b', reasoning: { efforts: ['low', 'high'], defaultEffort: 'high', mandatory: false } });
  assert.deepEqual(normalized.reasoning?.efforts, ['low', 'high']);
});
test('a malformed catalogue cannot crash the picker', () => {
  assert.deepEqual(normalizeModels(null), []);
  assert.deepEqual(normalizeModels([null, 7, { name: 'no id' }]), []);
  assert.deepEqual(normalizeModel({ id: 'a/b' }).reasoning?.efforts, []);
  assert.equal(normalizeModel({ id: 'a/b', created: 'soon' }).created, null);
});
test('the offline catalogue ships the ladders the live one would', () => {
  const byId = new Map(fallbackModels.map(m => [m.id, m]));
  assert.deepEqual(byId.get('anthropic/claude-opus-5')?.reasoning?.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  // A mandatory reasoner never offers None, even in the shipped list.
  assert.ok(!byId.get('openai/gpt-6-astra')?.reasoning?.efforts.includes('none'));
  assert.ok(byId.get('openai/gpt-5.6-luna')?.reasoning?.efforts.includes('none'));
  // Every fallback model carries a ladder field, empty or not.
  assert.ok(fallbackModels.every(m => Array.isArray(m.reasoning?.efforts)));
});

test('a model OpenRouter does not serve is never offered', () => {
  // These two sit in the curated backend config but have no listing on
  // OpenRouter, so quoting one answers "temporarily unavailable". The live
  // catalogue hides them by reporting no price; the shipped list has to agree,
  // or the picker promises a model that cannot answer.
  const byId = new Map(fallbackModels.map(model => [model.id, model]));
  assert.equal(byId.get('google/gemini-3.8-pro')?.available, false);
  assert.equal(byId.get('x-ai/grok-4.6-fast')?.available, false);
  assert.equal(byId.get('anthropic/claude-opus-5')?.available, true);
  // AgentSheet offers only what is available once anything is, so they drop out.
  const offered = fallbackModels.filter(model => model.available);
  assert.ok(!offered.some(model => model.id === 'google/gemini-3.8-pro'));
  assert.ok(offered.length > 100, `The rest of the catalogue still stands, saw ${offered.length}`);
});
test('the companies asked to be unlisted stay unlisted', () => {
  const vendors = new Set(groupCompanies(fallbackModels).map(company => company.vendor));
  for (const gone of ['baidu', 'upstage', 'stepfun', 'ibm-granite', 'inception'])
    assert.ok(!vendors.has(gone), `${gone} must not appear in the picker`);
  const ids = groupCompanies(fallbackModels).flatMap(company => company.models).map(model => model.id);
  for (const gone of ['openai/gpt-5.6-luna-mini', 'openai/gpt-5.4-nano', 'openai/gpt-chat-latest',
    'openai/gpt-oss-120b'])
    assert.ok(!ids.includes(gone), `${gone} must not appear in the picker`);
  assert.ok(!ids.some(id => /-latest$/.test(id)), 'A -latest id is a pointer, not a model');
});

test('the shipped catalogue matches the backend’s free line', () => {
  // The ceiling the backend prices against is $1.00/M in and $5.00/M out, which
  // admits every curated model except the four flagships.
  const included = fallbackModels.filter(model => model.trial && model.available).map(model => model.id);
  for (const within of ['mistralai/mistral-small-3.2-24b-instruct', 'qwen/qwen3.8-flash',
    'meta-llama/llama-4-maverick', 'deepseek/deepseek-chat-v3.1', 'anthropic/claude-haiku-4.5',
    'google/gemini-3.8-flash', 'mistralai/devstral-2512', 'z-ai/glm-5'])
    assert.ok(included.includes(within), `${within} is within the ceiling and should be included`);
  // The flagships are what the paywall is for; a ceiling that reached them would
  // leave nothing behind it.
  for (const flagship of ['openai/gpt-6-astra', 'anthropic/claude-opus-5',
    'anthropic/claude-sonnet-5', 'x-ai/grok-4.6'])
    assert.ok(!included.includes(flagship), `${flagship} is a flagship and must be locked`);
  // Auto is routed per turn now, but `vibes.auto_model` is still what it falls back
  // to when no pricing snapshot has loaded, so that one must stay free or a free
  // account could be left unable to send at all.
  assert.ok(included.includes('qwen/qwen3.8-flash'), 'The Auto fallback model must be free');
});
test('nothing is included by decision, so price and curation are the only gates', () => {
  // `vibes.free_extra` is empty on both sides. It used to name GPT-5.5, GPT-5.6
  // Terra and Opus 4.8 — GPT-5.5 alone is $30/M out, dearer than Opus 5, which was
  // locked beside it — and each one was a dear model the trial paid for in full.
  // A model reaches the trial by being curated and cheap, or it does not reach it.
  const included = fallbackModels.filter(model => model.trial && model.available).map(model => model.id);
  for (const dear of ['openai/gpt-5.5', 'openai/gpt-5.6-terra', 'anthropic/claude-opus-4.8'])
    assert.ok(!included.includes(dear), `${dear} is past the free ceiling and must be locked`);
});
test('no uncurated catalogue model is ever included free', () => {
  // Only the curated list carries a tier and a written blurb; nothing has vetted
  // the rest of the snapshot for a first chat, whatever it costs. There is no
  // exception any more: an empty override list is what makes this absolute.
  const loose = fallbackModels.filter(model => model.trial && !model.tier).map(model => model.id);
  assert.deepEqual(loose, [], 'Only curated models may be trial-funded');
});
