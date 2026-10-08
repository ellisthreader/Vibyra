import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBlocker, applySummary } from '../src/components/teammates/worktreeApply.ts';

const sha = 'a'.repeat(64);

test('apply needs the fingerprint of the reviewed listing', () => {
  assert.equal(applyBlocker(0, undefined), '');
  assert.equal(applyBlocker(2, { ready: true, snapshotSha256: sha }), '');
  assert.equal(applyBlocker(2, undefined), 'Refresh the review before applying.');
  assert.equal(applyBlocker(60, { ready: false, reason: 'Review the worktree in smaller changes before publishing.' }),
    'Apply is unavailable: Review the worktree in smaller changes before applying.');
});

test('a conflict says nothing was written; success says nothing was committed', () => {
  assert.match(applySummary({ applied: false, files: [], unchanged: [], conflicts: [{ path: 'a.txt', reason: 'x' }] }),
    /^Nothing was applied\. 1 file changed in your project .* Resolve it,/);
  assert.equal(applySummary({ applied: true, files: ['a', 'b'], unchanged: [], conflicts: [] }),
    'Applied 2 files to your project as uncommitted changes. Nothing was committed.');
  assert.equal(applySummary({ applied: true, files: [], unchanged: ['a'], conflicts: [] }), 'Your project already has these changes.');
});
