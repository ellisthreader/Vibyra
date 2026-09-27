import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewOwnership } from '../src/lib/previewOwnership.ts';

test('project cleanup waits for a late worktree start and never stops another project', async () => {
  const ownership = new PreviewOwnership(); const stopped = [];
  let resolve;
  const late = ownership.start('/a', '/a-worktree', () => new Promise(r => { resolve = r; }));
  await ownership.start('/b', '/b-worktree', async () => 'running');
  const stop = ownership.stop('/a', async root => { stopped.push(root); });
  await assert.rejects(ownership.start('/a', '/a-second', async () => 'running'), /stopping/);
  assert.deepEqual(stopped, []);
  resolve('running'); await late; await stop;
  assert.deepEqual(stopped.sort(), ['/a', '/a-worktree']);
  await ownership.start('/a', '/a-new', async () => 'running');
  await ownership.stop('/b', async root => { stopped.push(root); });
  assert.ok(stopped.includes('/b-worktree'));
  assert.ok(!stopped.includes('/a-new'));
});

test('failed cleanup retains exact roots for retry, including a deleted worktree directory', async () => {
  const ownership = new PreviewOwnership(); let attempts = 0;
  await ownership.start('/project', '/deleted-worktree', async () => 'running');
  await assert.rejects(ownership.stop('/project', async root => { if (root === '/deleted-worktree') throw new Error('busy'); }), /busy/);
  await ownership.stop('/project', async root => { if (root === '/deleted-worktree') attempts++; });
  assert.equal(attempts, 1);
});
