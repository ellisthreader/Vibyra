import test from 'node:test';
import assert from 'node:assert/strict';
import { breadthWords, broadChoice } from '../src/components/teammates/folderBreadth.ts';

// F-31: the Mac decides whether a chosen folder is too broad (it opens the picker, so only it sees the path
// before anything is granted). The renderer only recognises that answer and words it.

test('a broad-folder answer is recognised for home, a disk root and a broad parent', () => {
  for (const broad of ['home', 'root', 'broad']) {
    assert.deepEqual(broadChoice({ broad, path: '/Users/me/Documents', label: 'Documents' }), { broad, path: '/Users/me/Documents', label: 'Documents' });
  }
});

test('anything that is not a complete broad-folder answer is ignored, so a normal grant is never mistaken for one', () => {
  const grant = { id: 'g', agentId: 'a', label: 'site', path: '/Users/me/site', canWrite: true, revoked: false };
  for (const value of [null, undefined, 'broad', 42, [], {}, { cancelled: true }, grant, { broad: 'ok', path: '/x', label: 'x' },
    { broad: 'huge', path: '/x', label: 'x' }, { broad: 'home', path: '', label: 'x' }, { broad: 'home', path: 7, label: 'x' }, { broad: '', path: '/x', label: 'x' }]) {
    assert.equal(broadChoice(value), null, JSON.stringify(value));
  }
});

test('the shown path is plain text of bounded length and a missing label falls back to the folder name', () => {
  const long = `/Users/me/${'a'.repeat(500)}`;
  assert.equal(broadChoice({ broad: 'broad', path: long, label: 'x' }).path.length, 300);
  assert.equal(broadChoice({ broad: 'broad', path: '/Users/me/Documents' }).label, 'Documents');
});

test('each breadth has its own calm wording and never promises edits', () => {
  assert.deepEqual(Object.keys(breadthWords).sort(), ['broad', 'home', 'root']);
  assert.equal(new Set(Object.values(breadthWords).map(w => w.title)).size, 3);
  for (const { title, detail } of Object.values(breadthWords)) {
    assert.match(title, /\S{3}/); assert.match(detail, /sent to the AI model/);
    assert.doesNotMatch(`${title} ${detail}`, /[<>]|edit access|allow edits/i);
  }
  assert.match(breadthWords.home.title, /home folder/);
  assert.match(breadthWords.broad.title, /more than one project/);
});
