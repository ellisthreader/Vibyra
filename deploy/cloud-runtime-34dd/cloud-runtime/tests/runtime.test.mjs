import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Lease } from '../src/lease.mjs';
import { restore, snapshot, safePath, sha, validateNames } from '../src/files.mjs';
import { Commands } from '../src/commands.mjs';
test('signed leases reject wrong scope, tampering and expired authority', () => {
  const keys = generateKeyPairSync('ed25519'); const raw = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
  let clock = 1000000; const lease = new Lease(raw, { workspace: 'ws', machine: 'm', generation: 1 }, () => clock);
  const payload = Buffer.from(JSON.stringify({ workspace: 'ws', machine: 'm', generation: 1, state: 'ready', expires: 1020 })).toString('base64');
  const signed = { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString('base64') };
  lease.accept(signed); assert.equal(lease.active(), true); clock = 1020000; assert.equal(lease.active(), false); assert.throws(() => lease.accept(signed));
  assert.throws(() => new Lease(raw, { workspace: 'other' }, () => 1000000).accept(signed));
  assert.throws(() => lease.accept({ ...signed, payload: payload + 'x' }));
});
test('binary executable restore, exclusions, traversal and symlink protection', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-cloud-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const b = Buffer.from([0, 1, 255]); const files = [{ path: 'bin/run', content: b.toString('base64'), sha256: sha(b), executable: true }];
  const limits = { files: 100, fileBytes: 10000, projectBytes: 100000 };
  await restore(root, files, limits); assert.deepEqual(await snapshot(root, limits), files);
  await fs.writeFile(path.join(root, '.env'), 'private'); assert.equal((await snapshot(root, limits)).length, 1);
  for (const name of ['.npmrc', '.netrc', '.pypirc']) { await fs.writeFile(path.join(root, name), 'private'); await assert.rejects(safePath(root, name)); }
  assert.equal((await snapshot(root, limits)).length, 1);
  assert.throws(() => validateNames([{ path: 'Source/a' }, { path: 'source/b' }]));
  assert.throws(() => validateNames([{ path: 'source' }, { path: 'source/b' }]));
  await assert.rejects(safePath(root, '../escape')); await fs.symlink('/tmp', path.join(root, 'link'));
  await assert.rejects(safePath(root, 'link/escape', true)); await assert.rejects(snapshot(root, limits));
});
test('commands have no inherited credentials and are killed at their deadline', async () => {
  process.env.VIBYRA_BOOTSTRAP = 'private'; const runner = new Commands();
  const result = await runner.run('env', '/tmp', 1000); assert.doesNotMatch(result.stdout, /VIBYRA_BOOTSTRAP=/);
  const start = Date.now(); const stopped = await runner.run('sleep 10', '/tmp', 100); assert.equal(stopped.signal, 'SIGKILL'); assert.ok(Date.now() - start < 2000);
});
