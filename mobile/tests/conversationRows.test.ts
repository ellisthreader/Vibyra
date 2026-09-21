import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationRows } from '../src/conversation/conversationRows';
import type { ConversationItem } from '../src/conversation/types';
import { generationPresentation, workHistoryLabel } from '../src/conversation/generation';

test('activity segments preserve chronology around questions and turn boundaries', () => {
  const items: ConversationItem[] = [
    { id: 'a', turnId: 'one', kind: 'activity', title: 'Reading files', status: 'completed' },
    { id: 'q', turnId: 'one', kind: 'question', title: 'Choose', questions: [], status: 'pending' },
    { id: 'b', turnId: 'one', kind: 'activity', title: 'Running command', status: 'running', detail: 'npm test' },
    { id: 'c', turnId: 'two', kind: 'activity', title: 'Reading files', status: 'completed' },
  ];
  const rows = conversationRows(items);
  assert.deepEqual(rows.map(row => row.id), ['activities:a', 'q', 'activities:b', 'activities:c']);
  assert.equal(rows[0].kind, 'activities');
  if (rows[0].kind === 'activities') assert.deepEqual(rows[0].items.map(item => item.id), ['a']);
  assert.equal(items.length, 4);
  assert.equal(conversationRows(items.slice(0, 2))[0].id, rows[0].id);
});

test('interleaved commentary and tools form one ordered disclosure; the answer stays on the canvas', () => {
  const items: ConversationItem[] = [
    { id: 'u', turnId: 't', kind: 'message', role: 'user', text: 'Fix it' },
    { id: 'a', turnId: 't', kind: 'message', role: 'assistant', text: 'Checking the files.' },
    { id: 'r', turnId: 't', kind: 'activity', title: 'Thinking', status: 'running' },
    { id: 'b', turnId: 't', kind: 'message', role: 'assistant', text: 'I found the cause.' },
    { id: 'c', turnId: 't', kind: 'activity', title: 'Updating files', status: 'running' },
  ];
  const before = JSON.stringify(items);
  const rows = conversationRows(items);
  assert.deepEqual(rows.map(row => row.id), ['u', 'activities:a']);
  assert.equal(rows[1].kind, 'activities');
  if (rows[1].kind === 'activities') assert.deepEqual(rows[1].items.map(item => item.id), ['a', 'r', 'b', 'c']);
  assert.deepEqual(generationPresentation(rows, 'working', true, 't'), { owner: 'activities:a', label: 'Updating files' });
  const answer: ConversationItem = { id: 'answer', turnId: 't', kind: 'message', role: 'assistant', text: 'Fixed the issue.',
    source: { id: 'answer', turnId: 't', kind: 'message', role: 'assistant', status: 'running' } };
  const streaming = conversationRows([...items, answer]);
  assert.deepEqual(streaming.map(row => row.id), ['u', 'activities:a', 'answer']);
  assert.deepEqual(generationPresentation(streaming, 'working', true, 't'), { owner: 'answer', label: 'Writing response' });
  assert.equal(generationPresentation(streaming, 'idle', true, 't'), null);
  assert.equal(generationPresentation(streaming, 'working', false, 't'), null);
  assert.equal(JSON.stringify(items), before, 'Presentation never mutates provider history');
});

test('pending decisions, stopped turns and empty first tokens never produce competing indicators', () => {
  const items: ConversationItem[] = [
    { id: 'old', turnId: 'old', kind: 'activity', title: 'Thinking', status: 'running' },
    { id: 'empty', turnId: 'new', kind: 'message', role: 'assistant', text: '' },
  ];
  assert.deepEqual(conversationRows(items).map(row => row.id), ['activities:old']);
  assert.deepEqual(generationPresentation(conversationRows(items), 'working', true, 'new'), { owner: 'footer', label: 'Thinking' });
  assert.equal(generationPresentation([], 'idle', true), null);
  assert.equal(generationPresentation([], 'waiting', true), null);
  assert.deepEqual(generationPresentation([], 'working', true), { owner: 'footer', label: 'Thinking' });
  const request: ConversationItem = { id: 'q', turnId: 'new', kind: 'question', title: 'Choose', status: 'pending', questions: [] };
  assert.equal(generationPresentation(conversationRows([...items, request]), 'working', true, 'new'), null);
  assert.equal(generationPresentation(conversationRows([...items, { ...request, status: 'resolving' }]), 'working', true, 'new'), null);
  const stopped: ConversationItem = { id: 'stop', turnId: 'new', kind: 'result', text: 'Stopped', status: 'interrupted' };
  assert.equal(generationPresentation(conversationRows([...items, stopped]), 'working', true, 'new'), null);
  assert.equal(workHistoryLabel([{ id: 'a', turnId: 't', kind: 'activity', title: 'Run', status: 'interrupted' }]), 'Work stopped');
  assert.equal(workHistoryLabel([{ id: 'a', turnId: 't', kind: 'activity', title: 'Run', status: 'running' }]), 'Work details');
});
