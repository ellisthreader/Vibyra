import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffLines, splitDiff } from '../src/conversation/diffLines';
import { parseCommand, readArtifact, changedFiles } from '../src/conversation/inspection';
import { uploadAttachment } from '../src/conversation/attachmentUpload';
import type { AgentItem } from '../src/state/conversationTypes';
test('unified and split diffs retain real old/new hunk coordinates and uneven replacements', () => {
  const lines = diffLines('@@ -10,3 +20,2 @@\n old\n-first\n-second\n+new');
  assert.equal(lines[1].oldLine, 10); assert.equal(lines[1].newLine, 20);
  assert.equal(lines[2].oldLine, 11); assert.equal(lines[4].newLine, 21);
  const split = splitDiff(lines);
  assert.equal(split[2].left?.text, '-first'); assert.equal(split[2].right?.text, '+new');
  assert.equal(split[3].left?.text, '-second'); assert.equal(split[3].right, undefined);
});
test('unknown slash commands remain commands, while aliases resolve to a typed action', () => {
  const catalogue = { version: 1, commands: [{ name: 'effort', description: '', scope: 'settings', aliases: ['reasoning'], available: true }], unsupported: [] };
  assert.equal(parseCommand('ordinary prompt', catalogue), null);
  assert.equal(parseCommand('/reasoning high', catalogue)?.name, 'effort');
  assert.equal(parseCommand('/unknown', catalogue)?.supported, false);
});
test('changes exclude unrelated turns and preserve delete and rename operations', () => {
  const items = [ { id: 'a', turnId: 'one', category: 'fileChange', kind: 'activity', status: 'completed', changes: [
    { path: 'old.ts', kind: { type: 'delete' }, added: 0, removed: 8 } ] },
  { id: 'b', turnId: 'two', category: 'fileChange', kind: 'activity', status: 'completed', changes: [
    { path: 'old.ts', kind: { type: 'update', move_path: 'new.ts' }, added: 2, removed: 1 } ] } ] as AgentItem[];
  assert.equal(changedFiles(items, 'one').length, 1); assert.equal(changedFiles(items, 'two')[0].operation, 'Renamed');
});
test('artifact pages are assembled once with the selected hash and reject stalled offsets', async () => {
  const item = { id: 'a', kind: 'activity', turnId: 't', status: 'completed', artifact: { id: 'art', hash: 'h', bytes: 4, truncated: false } } as AgentItem;
  const calls: number[] = [];
  const result = await readArtifact(async p => { assert.equal(p.hash, 'h'); calls.push(Number(p.offset)); return {
    id: 'art', hash: 'h', bytes: 4, content: p.offset === 0 ? 'ab' : 'cd', offset: Number(p.offset), nextOffset: p.offset === 0 ? 2 : null,
  }; }, item);
  assert.equal(result, 'abcd'); assert.deepEqual(calls, [0, 2]);
  await assert.rejects(readArtifact(async () => ({ id: 'art', hash: 'h', bytes: 4, content: 'ab', offset: 0, nextOffset: 0 }), item), /pagination/);
});
test('attachments are acknowledged only after all bounded chunks reach the computer', async () => {
  const chunks: Record<string, unknown>[] = [];
  const result = await uploadAttachment(async p => { chunks.push(p); return { id: 'id', name: 'photo', mime: 'image/png', complete: Boolean(p.complete), hash: p.complete ? 'hash' : '' }; }, 'id', 'photo', 'image/png', 'x'.repeat(33000));
  assert.equal(result.hash, 'hash'); assert.deepEqual(chunks.map(c => c.offset), [0, 16384, 32768]);
  assert.deepEqual(chunks.map(c => c.complete), [false, false, true]);
});

test('conversation links allow explicit HTTPS navigation and reject executable or credential URLs', async () => {
  const { safeConversationLink } = await import('../src/conversation/safeLink');
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'vibyra://pair', 'https://user:secret@example.com', 'https://example.com\n']) assert.equal(safeConversationLink(bad), null);
  assert.equal(safeConversationLink('https://example.com/docs?q=one'), 'https://example.com/docs?q=one');
});
