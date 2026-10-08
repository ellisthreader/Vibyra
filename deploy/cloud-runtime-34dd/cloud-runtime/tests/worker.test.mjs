import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sha } from '../src/files.mjs';
test('real worker restores, reads, edits, runs a command and independently snapshots', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-cloud-worker-'));
  const worker = fork(new URL('../src/worker.mjs', import.meta.url), [], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(async () => { worker.kill(); await fs.rm(root, { recursive: true, force: true }); });
  const call = m => new Promise((resolve, reject) => { const id = randomUUID(); const timer = setTimeout(() => reject(Error('Worker timed out')), 5000);
    const receive = answer => { if (answer.id !== id) return; clearTimeout(timer); worker.off('message', receive); answer.error ? reject(Error(answer.error)) : resolve(answer.result); };
    worker.on('message', receive); worker.send({ ...m, id }); });
  await call({ type: 'init', root, restore: true, limits: { files: 100, fileBytes: 10000, projectBytes: 100000 },
    files: [{ path: 'app.txt', content: Buffer.from('hello').toString('base64'), sha256: sha(Buffer.from('hello')) }] });
  const action = (operation, args) => call({ type: 'action', action: { operation, arguments: args, expiresAt: Math.floor(Date.now()/1000) + 3 } });
  assert.equal((await action('read_file', { path: 'app.txt' })).content, 'hello');
  await assert.rejects(action('write_file', { path: 'app.txt', content: 'bad', expectedSha256: 'wrong' }));
  await action('write_file', { path: 'app.txt', content: 'HELLO cloud', expectedSha256: sha(Buffer.from('hello')) });
  assert.equal((await action('search_files', { query: 'hello' })).matches.length, 1);
  await action('write_file', { path: 'new.txt', content: 'new', expectedSha256: 'new' });
  await assert.rejects(action('write_file', { path: 'new.txt', content: 'overwrite', expectedSha256: 'new' }));
  assert.equal((await action('cloud_run_command', { command: 'cat app.txt' })).stdout, 'HELLO cloud');
  const files = (await call({ type: 'snapshot' })).files; assert.equal(files.length, 2); assert.equal(files[0].sha256, sha(Buffer.from('HELLO cloud')));
});
