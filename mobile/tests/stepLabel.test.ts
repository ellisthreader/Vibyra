import test from 'node:test';
import assert from 'node:assert/strict';
import { commandText, groupSummary, stepLabel } from '../src/conversation/stepLabel';
import type { ConversationActivity } from '../src/conversation/types';
import type { AgentItem } from '../src/state/conversationTypes';

const step = (source: Partial<AgentItem>, status: ConversationActivity['status'] = 'completed', detail?: string): ConversationActivity =>
  ({ id: source.id ?? 'x', turnId: 't', kind: 'activity', title: source.title ?? 'Working', detail, status,
    source: { id: 'x', turnId: 't', kind: 'activity', status, ...source } as AgentItem });

test('reads, searches and listings name what they touched, in the right tense', () => {
  const read = { category: 'commandExecution', actions: [{ type: 'read', path: 'src/ui/App.tsx' }] };
  assert.deepEqual(stepLabel(step(read, 'running')), { kind: 'read', verb: 'Reading', subject: 'App.tsx' });
  assert.equal(stepLabel(step(read)).verb, 'Read');
  assert.equal(stepLabel(step({ category: 'commandExecution', actions: [{ type: 'read', path: 'a.ts' }, { type: 'read', path: 'b.ts' }] })).subject, '2 files');
  assert.equal(stepLabel(step({ category: 'commandExecution', actions: [{ type: 'search', query: 'useTheme' }] })).subject, '“useTheme”');
});

test('commands show what ran, without the cd prefix, and say when they failed', () => {
  const label = stepLabel(step({ category: 'commandExecution', command: 'cd /p && npm test -- welcome', actions: [{ type: 'unknown' }] }));
  assert.deepEqual(label, { kind: 'command', verb: 'Ran', subject: 'npm test -- welcome', code: true });
  assert.equal(stepLabel(step({ category: 'commandExecution', command: 'npm test' }, 'failed')).verb, 'Failed');
  assert.equal(commandText('x'.repeat(80)).length, 64);
});

test('file changes carry their line counts; new files say created', () => {
  const edit = stepLabel(step({ category: 'fileChange', changes: [{ path: 'src/a.ts', kind: { type: 'update' }, added: 12, removed: 3 }] }));
  assert.deepEqual(edit, { kind: 'edit', verb: 'Edited', subject: 'a.ts', added: 12, removed: 3 });
  assert.equal(stepLabel(step({ category: 'fileChange', changes: [{ path: 'n.ts', kind: { type: 'add' }, added: 4, removed: 0 }] }, 'running')).verb, 'Creating');
});

test('tools are named for people, and Claude subagents say what they were given', () => {
  const github = JSON.stringify({ server: 'github', tool: 'create_issue', arguments: {} });
  assert.equal(stepLabel(step({ category: 'mcpToolCall' }, 'completed', github)).subject, 'Github · Create issue');
  const task = JSON.stringify({ server: 'Claude', tool: 'Task', arguments: { description: 'Explore the repo' } });
  assert.deepEqual(stepLabel(step({ category: 'mcpToolCall' }, 'running', task)), { kind: 'tool', verb: 'Delegating', subject: 'Explore the repo' });
  assert.equal(stepLabel(step({ category: 'webSearch' }, 'completed', JSON.stringify({ query: 'https://docs.expo.dev/x' }))).subject, 'docs.expo.dev');
});

test('a finished group reads as one line', () => {
  assert.equal(groupSummary([
    step({ category: 'commandExecution', actions: [{ type: 'read', path: 'a' }] }),
    step({ category: 'commandExecution', actions: [{ type: 'search', query: 'q' }] }),
    step({ category: 'commandExecution', command: 'npm test' }),
    step({ category: 'fileChange', changes: [{ path: 'a', kind: { type: 'update' }, added: 1, removed: 1 }] }),
    step({ category: 'fileChange', changes: [{ path: 'a', kind: { type: 'update' }, added: 1, removed: 0 }] }),
  ]), 'Explored 2 files · ran 1 command · edited 1 file');
  assert.equal(groupSummary([step({ category: 'reasoning' })]), 'Thought it through');
});

test('older history with only a general title still reads naturally', () => {
  const old = { ...step({ category: 'commandExecution' }), title: 'Reading files' };
  assert.equal(stepLabel(old).verb, 'Read files');
  assert.equal(stepLabel({ ...old, status: 'running' }).verb, 'Reading files');
});

test("Codex's login-shell wrapper is not part of the command", () => {
  assert.equal(commandText("/bin/zsh -lc 'npm run start:website'"), 'npm run start:website');
  assert.equal(commandText('bash -c "cd /p && npm test"'), 'npm test');
});
