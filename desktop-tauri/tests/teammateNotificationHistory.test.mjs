import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRunTurns } from '../src/components/teammates/runsV2.ts';

const run = (id, extra = {}) => ({ id, agentId: 'agent', conversationId: 'chat', conversationSeq: 1,
  state: 'completed', terminal: true, prompt: 'Task', answer: 'Done', actions: [],
  createdAt: '2026-10-07T12:00:00Z', ...extra });

test('a notification fetches its older task outside the latest page without a write', async () => {
  const calls = [];
  const api = async (path, body) => {
    calls.push(path); assert.equal(body, undefined);
    return path.includes('?') ? { runs: [run('new')] }
      : { run: run('old', { createdAt: '2026-10-01T12:00:00Z' }) };
  };
  const result = await loadRunTurns(api, 'agent', 'chat', new Map(), 'old');
  assert.deepEqual(result.turns.map(turn => turn.id), ['old', 'new']);
  assert.deepEqual(calls, ['agents/v2/runs?agentId=agent&limit=20', 'agents/v2/runs/old']);
});

test('a notification refuses another teammate or conversation and a mismatched task', async () => {
  for (const extra of [{ agentId: 'other' }, { conversationId: 'other' }, { id: 'other' }]) {
    const api = async path => path.includes('?') ? { runs: [] } : { run: run('old', extra) };
    await assert.rejects(loadRunTurns(api, 'agent', 'chat', new Map(), 'old'), /not available/);
  }
});

test('a task already on the newest page is not fetched twice', async () => {
  const calls = [];
  const result = await loadRunTurns(async path => { calls.push(path); return { runs: [run('new')] }; }, 'agent', 'chat', new Map(), 'new');
  assert.equal(result.turns.length, 1);
  assert.equal(calls.length, 1);
});
