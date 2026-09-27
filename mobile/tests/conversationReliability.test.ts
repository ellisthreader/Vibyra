import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSession } from '../src/state/session';
import { delay } from './runtimeHarness';
import { conversationReliabilityHarness } from './conversationReliabilityHarness';

test('model and effort changes reconcile confirmed settings without relying on an event', async () => {
  const h = await conversationReliabilityHarness();
  try {
    await h.store.actions.setConversationSettings!('account-two', 'medium', 7);
    assert.equal(h.store.state.conversation?.settings?.model, 'account-two');
    assert.equal(h.store.state.conversation?.settings?.revision, 8);
    await h.store.actions.setConversationSettings!('account-two', 'high', 8);
    assert.equal(h.store.state.conversation?.settings?.effort, 'high');
    assert.equal(h.store.state.conversation?.settings?.revision, 9);
    assert.equal(h.store.state.control, 'ready');
  } finally { h.store.dispose(); }
});

test('a settings conflict refreshes the revision and a second choice can succeed', async () => {
  const h = await conversationReliabilityHarness();
  try {
    h.intercept(message => {
      if (message.payload?.method !== 'conversation.settings') return false;
      h.settings.revision = 10;
      h.rpc.receive({ type: 'message', connectionId: message.connectionId,
        payload: { id: message.payload.id, ok: false, error: { message: 'Settings changed on another device' } } });
      return true;
    });
    await assert.rejects(h.store.actions.setConversationSettings!('account-two', 'medium', 7), /another device/);
    assert.equal(h.store.state.conversation?.settings?.revision, 10);
    h.intercept();
    await h.store.actions.setConversationSettings!('account-two', 'medium', 10);
    assert.equal(h.store.state.conversation?.settings?.revision, 11);
  } finally { h.store.dispose(); }
});

test('delayed model reads and writes cannot complete into another selected chat', async () => {
  const h = await conversationReliabilityHarness();
  try {
    const held: any[] = [];
    h.intercept(message => {
      if (!['conversation.models', 'conversation.settings'].includes(message.payload?.method)) return false;
      held.push(message); return true;
    });
    const read = assert.rejects(h.store.actions.conversationRequest!('conversation.models'), /conversation changed/);
    const write = assert.rejects(h.store.actions.setConversationSettings!('account-two', 'medium', 7), /conversation changed/);
    await assert.rejects(h.store.actions.setConversationSettings!('account-three', 'high', 7), /already/);
    await delay();
    await selectSession(h.store, 'two');
    // Returning to the same ID still represents a new selection.
    await selectSession(h.store, 'one');
    held.forEach(message => h.reply(message, { models: [] }));
    await Promise.all([read, write]);
    assert.equal(h.store.state.conversation?.settings?.model, 'account-one');
  } finally { h.store.dispose(); }
});

test('old lifecycle events cannot revoke control; output gaps keep same-generation control', async () => {
  const h = await conversationReliabilityHarness();
  try {
    h.event('conversation.updated', { ...h.snapshot(), processState: 'exited', turnState: 'failed' });
    assert.equal(h.store.state.control, 'ready');
    assert.equal(h.store.state.conversation?.processState, 'running');
    h.intercept(message => {
      if (message.payload?.method !== 'conversation.snapshot') return false;
      h.reply(message, h.snapshot('one', 3)); return true;
    });
    h.event('conversation.updated', h.snapshot('one', 3));
    await delay();
    assert.equal(h.store.state.conversation?.cursor, 3);
    assert.equal(h.store.state.control, 'ready');
    assert.equal(h.store.state.error, null);
    h.event('conversation.updated', { ...h.snapshot('one', 4), generation: 'g2' });
    assert.equal(h.store.state.control, 'readonly');
    assert.equal(h.store.lease, null);
  } finally { h.store.dispose(); }
});
