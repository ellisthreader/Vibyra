import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationRows } from '../src/conversation/conversationRows';
import type { ConversationItem } from '../src/conversation/types';

test('activity stays in its original turn row without moving questions or losing ordered details', () => {
  const items: ConversationItem[] = [
    { id: 'a', turnId: 'one', kind: 'activity', title: 'Reading files', status: 'completed' },
    { id: 'q', turnId: 'one', kind: 'question', title: 'Choose', questions: [], status: 'pending' },
    { id: 'b', turnId: 'one', kind: 'activity', title: 'Running command', status: 'running', detail: 'npm test' },
    { id: 'c', turnId: 'two', kind: 'activity', title: 'Reading files', status: 'completed' },
  ];
  const rows = conversationRows(items);
  assert.deepEqual(rows.map(row => row.id), ['activities:one', 'q', 'activities:two']);
  assert.equal(rows[0].kind, 'activities');
  if (rows[0].kind === 'activities') assert.deepEqual(rows[0].items.map(item => item.id), ['a', 'b']);
  assert.equal(items.length, 4);
  assert.equal(conversationRows(items.slice(0, 2))[0].id, rows[0].id);
});
