import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSavedSkill } from '../src/agents/savedSkill';

test('restores only a complete saved skill request', () => {
  const skill = {
    id: 'one',
    revision: 2,
    name: 'Review',
    instructions: 'Check work',
    teammateIds: ['agent'],
  };
  assert.deepEqual(parseSavedSkill(JSON.stringify(skill)), skill);
  for (const invalid of [
    '{',
    '{}',
    '{"id":"one"}',
    JSON.stringify({ ...skill, revision: '2' }),
    JSON.stringify({ ...skill, teammateIds: [1] }),
  ]) {
    assert.throws(() => parseSavedSkill(invalid));
  }
});
