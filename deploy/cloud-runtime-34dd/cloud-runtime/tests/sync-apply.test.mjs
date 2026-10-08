import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { vmSetup, macRepo, enqueue, write, g, tmp } from './sync-helpers.mjs';
import { openBuffer, sealBuffer } from '../src/sync-crypto.mjs';
import { shadowGit } from '../src/sync-git.mjs';

const lastApplied = api => api.applied.at(-1).body;

test('first full bundle creates the project, honours the exec bit, and reports applying around the work', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'README.md': 'hello\n', 'src/a.js': 'a', 'run.sh': { data: '#!/bin/sh\n', mode: 0o755 }, 'src/deep/b.txt': 'b' });
  enqueue(vm.api, s1); assert.equal(await vm.engine.drain(), 1);
  assert.deepEqual(await vm.listing('proj'), ['README.md', 'run.sh', 'src/a.js', 'src/deep/b.txt']);
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'README.md'), 'utf8'), 'hello\n'); assert.ok((await fs.stat(path.join(vm.wt('proj'), 'run.sh'))).mode & 0o100);
  assert.deepEqual(lastApplied(vm.api), { ok: true, head: s1.commit, state: 'synced' }); assert.deepEqual(vm.api.status, [false, true, false]); // false at start clears a flag a killed worker left behind
  const sg = shadowGit({ home: vm.paths.home, shadow: path.join(vm.paths.shadow, 'proj.git') }); assert.equal((await sg(['rev-parse', 'refs/vibyra/snap'])).out.toString().trim(), s1.commit);
  assert.equal(vm.api.keys.at(0), vm.vmKey.publicHex); assert.equal(await vm.engine.drain(), 0); // nothing pending: no status flapping
});
test('incremental bundle updates, deletes and adds files but leaves ignored files and .git alone', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { '.gitignore': 'node_modules/\ndist/\n', 'a.txt': '1', 'old/gone.txt': 'x', 'keep.txt': 'k' })); await vm.engine.drain();
  await write(vm.wt('proj'), { 'node_modules/pkg/index.js': 'built on the VM', 'dist/out.js': 'o' }); await fs.mkdir(path.join(vm.wt('proj'), '.git')); await fs.writeFile(path.join(vm.wt('proj'), '.git/HEAD'), 'ref: refs/heads/x\n');
  const s2 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '2', 'old/gone.txt': null, 'new/file.txt': 'n' }); assert.equal(s2.item.baseSeq, 1);
  const before = vm.api.blobs.size; enqueue(vm.api, s2); assert.ok(vm.api.blobs.size > before); await vm.engine.drain();
  assert.deepEqual(lastApplied(vm.api), { ok: true, head: s2.commit, state: 'synced' });
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '2'); assert.equal(await fs.stat(path.join(vm.wt('proj'), 'old')).catch(() => null), null);
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'new/file.txt'), 'utf8'), 'n');
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'node_modules/pkg/index.js'), 'utf8'), 'built on the VM'); assert.equal(await fs.readFile(path.join(vm.wt('proj'), '.git/HEAD'), 'utf8'), 'ref: refs/heads/x\n');
  assert.equal(await fs.stat(path.join(vm.wt('proj'), '.proj.syncing')).catch(() => null), null);
});
test('diverged: VM edits are never overwritten, a cloud snapshot is returned instead, and the next Mac snapshot applies once reviewed', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': 'mac1', 'b.txt': 'b' })); await vm.engine.drain();
  await write(vm.wt('proj'), { 'a.txt': 'VM EDIT', 'vm-new.txt': 'new' });
  const s2 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': 'mac2', 'b.txt': 'b2' }); enqueue(vm.api, s2); await vm.engine.drain();
  assert.deepEqual(lastApplied(vm.api), { ok: true, head: s2.commit, state: 'diverged', code: 'diverged', message: 'Vibyra Cloud has its own edits to this project, so it kept them.' });
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), 'VM EDIT'); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'b.txt'), 'utf8'), 'b');
  // the cloud snapshot went to the Mac, sealed for its key only
  assert.equal(vm.api.uploads.length, 1); const up = vm.api.uploads[0]; assert.deepEqual([up.kind, up.mac, up.seq, up.baseSeq], ['code', 'mac-1', 1, 0]);
  const bundle = await openBuffer(vm.mac.secret, up.body); const dir = await tmp(t); await fs.writeFile(path.join(dir, 'c.bundle'), bundle);
  g(mac.work, 'fetch', '-q', path.join(dir, 'c.bundle'), '+refs/vibyra/cloud:refs/vibyra/cloud'); assert.equal(g(mac.work, 'rev-parse', 'refs/vibyra/cloud'), up.head);
  assert.equal(g(mac.work, 'show', 'refs/vibyra/cloud:a.txt'), 'VM EDIT'); assert.equal(g(mac.work, 'show', 'refs/vibyra/cloud:vm-new.txt'), 'new');
  // The Mac reviews and sends the resolution; the worktree now equals what was returned, so applying is safe.
  const s3 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': 'merged', 'b.txt': 'b2', 'vm-new.txt': 'new' }); enqueue(vm.api, s3); await vm.engine.drain();
  assert.deepEqual(lastApplied(vm.api), { ok: true, head: s3.commit, state: 'synced' }); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), 'merged');
});
test('a folder that already has files and no applied snapshot counts as diverged; an empty one is fine', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  await write(vm.wt('proj'), { 'mine.txt': 'precious' }); enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' })); await vm.engine.drain();
  assert.equal(lastApplied(vm.api).state, 'diverged'); assert.deepEqual(await vm.listing('proj'), ['mine.txt']);
  const empty = await macRepo(t, 'empty'); await fs.mkdir(vm.wt('empty')); await fs.mkdir(path.join(vm.paths.shadow, 'empty.git').replace('empty.git', 'x'), { recursive: true });
  enqueue(vm.api, await empty.snapshot(vm.vmKey.publicHex, { 'z.txt': 'z' })); await vm.engine.drain(); assert.equal(lastApplied(vm.api).state, 'synced');
});
test('needFull when a prerequisite commit is missing; the same for items of a project the backend marked resync', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' }); const s2 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '2' }); enqueue(vm.api, s2); await vm.engine.drain();
  assert.deepEqual(lastApplied(vm.api).needFull, true); assert.equal(lastApplied(vm.api).ok, false); assert.deepEqual(await vm.listing('proj'), []);
  const full = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '3' }, { full: true }); assert.equal(full.item.baseSeq, 0); enqueue(vm.api, full); await vm.engine.drain(); assert.equal(lastApplied(vm.api).state, 'synced');
  const s4 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '4' }); vm.api.resync = ['proj']; enqueue(vm.api, s4); await vm.engine.drain();
  assert.equal(lastApplied(vm.api).needFull, true); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '3');
});
test('removed: a managed project folder and shadow go away; an unmanaged folder of the same name stays', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' })); await vm.engine.drain();
  await write(vm.wt('github-clone'), { 'x.txt': 'x' }); vm.api.removed = ['proj', 'github-clone', '../etc', 'nope'];
  assert.equal(await vm.engine.drain(), 1); // only the project this VM holds is work; the other names are no-ops
  const reports = vm.api.status.length; assert.equal(await vm.engine.drain(), 0); assert.equal(vm.api.status.length, reports, 'a removal listed again does not flap applying');
  assert.equal(await fs.stat(vm.wt('proj')).catch(() => null), null); assert.equal(await fs.stat(path.join(vm.paths.shadow, 'proj.git')).catch(() => null), null);
  assert.equal(await fs.readFile(path.join(vm.wt('github-clone'), 'x.txt'), 'utf8'), 'x');
});
test('integrity: wrong sha256, tampered ciphertext, wrong head and a bundle for another ref are refused and change nothing', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' });
  const bad = (name, mut) => { const item = { ...s1.item, id: name, ...mut.item }; vm.api.items.push(item); vm.api.blobs.set(name, mut.body ?? s1.body); };
  bad('sha', { item: { sha256: 'f'.repeat(64) } }); const t1 = Buffer.from(s1.body); t1[100] ^= 1; bad('tamper', { body: t1, item: { sha256: crypto.createHash('sha256').update(t1).digest('hex') } });
  bad('head', { item: { head: 'a'.repeat(40) } });
  const wrongRef = await fs.mkdtemp(path.join((await tmp(t)), 'r-')); g(mac.work, 'update-ref', 'refs/vibyra/other', s1.commit); g(mac.work, 'bundle', 'create', path.join(wrongRef, 'o.bundle'), 'refs/vibyra/other');
  const wb = await sealBuffer(vm.vmKey.publicHex, await fs.readFile(path.join(wrongRef, 'o.bundle'))); bad('ref', { body: wb, item: { sha256: crypto.createHash('sha256').update(wb).digest('hex') } });
  await vm.engine.drain(); const by = id => vm.api.applied.find(a => a.id === id).body;
  // Stored bytes that differ from what the Mac sent, or a first chunk that does not open (sealed for another key), are fixed by a fresh
  // full upload; a bundle that opens but is not the snapshot it claims is reported for the person.
  assert.deepEqual([by('sha').code, by('sha').needFull], ['download_failed', true]); assert.deepEqual([by('tamper').code, by('tamper').needFull], ['key_mismatch', true]);
  assert.deepEqual([by('head').code, by('ref').code, by('head').needFull], ['verify_failed', 'verify_failed', undefined]);
  for (const id of ['sha', 'tamper', 'head', 'ref']) { assert.equal(by(id).error, by(id).code); assert.ok(by(id).message.length > 10); }
  for (const id of ['sha', 'tamper', 'head', 'ref']) assert.equal(by(id).ok, false); assert.deepEqual(await vm.listing('proj'), []);
});
test('symlinks and gitlinks in a bundle are never created, and nothing is written outside the project', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t); const outside = await tmp(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'ok.txt': 'ok', 'link': { link: outside }, 'dir/inner.txt': 'i' }); enqueue(vm.api, s1); await vm.engine.drain();
  assert.equal(lastApplied(vm.api).state, 'synced'); assert.deepEqual(await vm.listing('proj'), ['dir/inner.txt', 'ok.txt']); assert.equal(await fs.lstat(path.join(vm.wt('proj'), 'link')).catch(() => null), null);
  assert.deepEqual(await fs.readdir(outside), []);
  // A symlink planted in the working folder where a directory is needed is replaced, not followed.
  await fs.symlink(outside, path.join(vm.wt('proj'), 'newdir'));
  const s2 = await mac.snapshot(vm.vmKey.publicHex, { 'newdir/inner.txt': 'i2' }); enqueue(vm.api, s2); await vm.engine.drain();
  assert.equal(lastApplied(vm.api).state, 'synced'); assert.deepEqual(await fs.readdir(outside), []); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'newdir/inner.txt'), 'utf8'), 'i2'); assert.ok((await fs.lstat(path.join(vm.wt('proj'), 'newdir'))).isDirectory());
});
test('re-delivered items (their report was lost) are answered from the record and never replayed over newer files', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' }), s2 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '2' }); enqueue(vm.api, s1, s2);
  const orig = vm.client.applied.bind(vm.client); let fail = true; vm.client.applied = async (id, body) => { if (fail && id === s1.item.id) throw Error('network'); return orig(id, body); };
  await assert.rejects(vm.engine.drain(), /network/); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '1'); fail = false;
  await vm.engine.drain(); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '2');
  vm.api.applied.length = 0; await vm.engine.drain(); assert.deepEqual(vm.api.applied.map(a => a.body.state), ['synced', 'synced']); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '2');
  vm.api.applied.length = 0; vm.api.items = [s1.item]; await vm.engine.drain(); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '2'); // old seq after a newer one
});
test('an apply interrupted mid-way (crash) resumes on the next item instead of reading its own half-written files as VM edits', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1', 'b.txt': '1' })); await vm.engine.drain();
  await fs.writeFile(path.join(vm.wt('proj'), 'a.txt'), 'half written'); await vm.engine.ctx.state.set('proj', { applying: 'deadbeef' }); await fs.mkdir(path.join(vm.paths.projects, '.proj.syncing')); await fs.writeFile(path.join(vm.paths.projects, '.proj.syncing/s0'), 'stale');
  const s2 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '2', 'b.txt': '2' }); enqueue(vm.api, s2);
  const fresh = (await import('../src/sync-loop.mjs')).createSyncEngine({ client: vm.client, paths: vm.paths }); await fresh.start(); // a restarted worker clears staging leftovers
  assert.equal(await fs.stat(path.join(vm.paths.projects, '.proj.syncing')).catch(() => null), null); await fresh.drain();
  assert.deepEqual(lastApplied(vm.api), { ok: true, head: s2.commit, state: 'synced' }); assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '2');
  assert.equal((await fresh.ctx.state.get('proj')).applying, null);
});
