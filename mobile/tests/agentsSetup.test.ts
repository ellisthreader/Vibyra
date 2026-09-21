import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreSetup } from '../src/agents/setup/restoreSetup';
import { specialistDraft } from '../src/agents/setup/specialists';
import { emptySetup } from '../src/agents/setup/types';

test('focused job suggestions preserve custom scope without inventing facts or granting tools', () => {
  const custom = 'Review my Figma checkout design for accessibility.';
  const { fields } = specialistDraft(custom);
  assert.equal(fields.name, 'Design reviewer'); assert.ok(fields.brief.startsWith(custom));
  assert.equal(fields.memory, ''); assert.deepEqual(fields.integrations, []);
  assert.equal(specialistDraft('Help me study algebra.').fields.name, 'Learning coach');
});

test('old setup memory and unsent multiline routines migrate without losing their contents', () => {
  const old = { ...emptySetup(), version: 1, step: 'memory', fields: { ...emptySetup().fields, memory: 'Name: Ellis' }, text: 'Keep answers concise.' };
  const memory = restoreSetup(JSON.stringify(old), null);
  assert.equal(memory.version, 2); assert.equal(memory.text, 'Name: Ellis\nKeep answers concise.');
  const routine = restoreSetup(JSON.stringify({ ...old, step: 'routine', text: 'Friday at 9\nUse the supplied notes\nHighlight decisions' }), null);
  assert.deepEqual(routine.routines, ['Friday at 9\nUse the supplied notes\nHighlight decisions']);
  assert.equal(restoreSetup(JSON.stringify(memory), null).text, memory.text, 'migration is not repeated');
});

test('pending creates retain exact UUID, payload and plans; no presentation migration rewrites them', () => {
  const pending = { id: 'same-id', fields: specialistDraft('Coding').fields, routines: ['Every Monday'], requestedTools: 'Calendar' };
  const restored = restoreSetup(JSON.stringify({ ...emptySetup(), version: 1, step: 'memory', pending }), null);
  assert.deepEqual(restored.pending, pending); assert.deepEqual(restored.fields, pending.fields); assert.equal(restored.step, 'review');
  const legacy = { id: 'old-modal-id', fields: pending.fields };
  const migrated = restoreSetup(null, JSON.stringify(legacy));
  assert.equal(migrated.pending!.id, legacy.id); assert.deepEqual(migrated.pending!.fields, legacy.fields);
});

test('corrupt saved drafts and incomplete pending requests fail closed', () => {
  assert.throws(() => restoreSetup('{', null));
  assert.throws(() => restoreSetup(JSON.stringify({ ...emptySetup(), pending: { id: 'existing-id' } }), null));
  assert.throws(() => restoreSetup(JSON.stringify({ ...emptySetup(), fields: { name: 'Partial' } }), null));
  assert.throws(() => restoreSetup(null, '{"fields":{}}'));
});
