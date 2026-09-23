import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentDraftKey,
  attachmentDrafts,
  clearAttachmentMemory,
  updateAttachmentDrafts,
} from '../src/vibes/attachmentMemory';

test('unsent attachments remain chat-scoped across remounts and clear with the owner', () => {
  const owner = 'vibes:attachment-memory-test:';
  const first = {
    key: attachmentDraftKey(),
    kind: 'image' as const,
    name: 'one.jpg',
    uri: 'file://one',
    status: 'ready' as const,
    id: 'uploaded-one',
  };
  const second = { ...first, key: attachmentDraftKey(), name: 'two.jpg', id: 'uploaded-two' };
  assert.notEqual(first.key, second.key);
  updateAttachmentDrafts(owner, 'chat-one', [first]);
  updateAttachmentDrafts(owner, 'chat-two', [second]);
  assert.deepEqual(attachmentDrafts(owner)['chat-one'], [first]);
  assert.deepEqual(attachmentDrafts(owner)['chat-two'], [second]);
  clearAttachmentMemory(owner);
  assert.deepEqual(attachmentDrafts(owner), {});
});
