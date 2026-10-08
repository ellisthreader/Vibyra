import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vmSetup, macRepo, enqueue, write, tmp, fakeApi, TOKEN, sleep, g } from './sync-helpers.mjs';
import { createSyncEngine, QUIET_MS, PERIODIC_MS } from '../src/sync-loop.mjs';
import { createSyncProcess } from '../src/sync-process.mjs';
import { ensureKey } from '../src/sync-key.mjs';
import { SyncClient } from '../src/sync-client.mjs';
import { gracefulStop } from '../src/graceful-stop.mjs';
import { openBuffer, generateKeyPair } from '../src/sync-crypto.mjs';

const worker = fileURLToPath(new URL('../src/sync-worker.mjs', import.meta.url));
async function ready(t) { const clock = { t: 1_000_000 }; const vm = await vmSetup(t, { now: () => clock.t, watchMs: 1 }); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1', 'b.txt': '2' })); await vm.engine.drain(); vm.api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 });
  const tick = async ms => { clock.t += ms; await vm.engine.watchTick(); }; return { vm, clock, tick }; }

test('return cadence: nothing while unchanged, 60 s quiet after a change, and at least every 5 minutes while edits continue', async t => {
  const { vm, tick } = await ready(t); await tick(1000); await tick(QUIET_MS); assert.equal(vm.api.uploads.length, 0); // baseline equals the applied snapshot
  await write(vm.wt('proj'), { 'a.txt': 'x1' }); await tick(1000); await tick(QUIET_MS - 5000); assert.equal(vm.api.uploads.length, 0, 'not quiet yet');
  await tick(6000); assert.equal(vm.api.uploads.length, 1, 'quiet for 60 s'); await tick(QUIET_MS); assert.equal(vm.api.uploads.length, 1);
  // continuous editing: a change every 20 s never goes quiet, but the 5-minute rule still returns it
  const before = vm.api.uploads.length; let n = 0; for (let s = 0; s < PERIODIC_MS + 40000; s += 20000) { await write(vm.wt('proj'), { 'b.txt': `y${n++}` }); await tick(20000); }
  assert.equal(vm.api.uploads.length - before, 1);
});
test('a project edited before a crash is returned on the first tick after restart (no quiet wait)', async t => {
  const { vm, clock } = await ready(t); await write(vm.wt('proj'), { 'a.txt': 'edited while the VM was dying' });
  const fresh = createSyncEngine({ client: vm.client, paths: vm.paths, now: () => clock.t, watchMs: 1 }); await fresh.start(); await fresh.watchTick(); assert.equal(vm.api.uploads.length, 1);
});
test('final pass: snapshots every changed project and its transcripts inside the budget, skips unchanged ones', async t => {
  const { vm } = await ready(t); await write(vm.wt('proj'), { 'a.txt': 'last words' });
  const root = vm.wt('proj'); const dir = path.join(vm.paths.home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-')); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'aaaa.jsonl'), '{"cwd":"x"}\n');
  const out = await vm.engine.finalPass(8000); assert.deepEqual(out.map(([n, r]) => [n, r.sent]), [['proj', true]]); assert.deepEqual(vm.api.uploads.map(u => u.kind), ['code', 'transcripts']);
  const again = await vm.engine.finalPass(8000); assert.equal(again[0][1].sent, false); assert.equal(vm.api.uploads.length, 2);
  const none = await vm.engine.finalPass(-1); assert.deepEqual(none, []);
});
test('run(): drains on an interval, signals the first drain even when the API fails, and stops when asked', async t => {
  const vm = await vmSetup(t, { drainMs: 10, watchMs: 100000 }); const mac = await macRepo(t); let stop = false, drained = 0; let calls = 0;
  const orig = vm.client.pending.bind(vm.client); vm.client.pending = async () => { if (calls++ === 0) throw Object.assign(Error('refused (404)'), { status: 404 }); return orig(); };
  const running = vm.engine.run({ isStopping: () => stop, onDrained: () => { drained++; } });
  await sleep(60); assert.equal(drained, 1); enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'late.txt': 'l' }));
  for (let i = 0; i < 200 && !(await fs.stat(path.join(vm.wt('proj'), 'late.txt')).catch(() => null)); i++) await sleep(50);
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'late.txt'), 'utf8'), 'l'); stop = true; await running; assert.equal(drained, 1);
});
test('VM key: created 0400 for the project user, reused, a planted symlink is replaced not followed, a volume reset publishes a new key', async t => {
  const d = await tmp(t); const dir = path.join(d, 'sync'); const k1 = await ensureKey(dir); const f = path.join(dir, 'key');
  assert.equal((await fs.stat(f)).mode & 0o777, 0o400); assert.equal((await fs.stat(f)).uid, process.getuid()); assert.match(k1.publicHex, /^[0-9a-f]{64}$/);
  assert.deepEqual(await ensureKey(dir), k1); await fs.chmod(f, 0o644); await ensureKey(dir); assert.equal((await fs.stat(f)).mode & 0o777, 0o400);
  const victim = path.join(d, 'victim'); await fs.writeFile(victim, 'untouched'); await fs.rm(f); await fs.symlink(victim, f); const k2 = await ensureKey(dir);
  assert.equal(await fs.readFile(victim, 'utf8'), 'untouched'); assert.ok((await fs.lstat(f)).isFile()); assert.notEqual(k2.publicHex, k1.publicHex);
  // engine publishes whatever key it holds on every start; after the volume is wiped the new key replaces the old one on the backend
  const api = await fakeApi(t); const paths = { home: path.join(d, 'h'), projects: path.join(d, 'p'), shadow: path.join(d, 's'), tmp: path.join(d, 't'), syncDir: dir };
  const mk = () => createSyncEngine({ client: new SyncClient(api.url, 'ws', TOKEN), paths }); await mk().start(); await mk().start(); await fs.rm(dir, { recursive: true }); await mk().start();
  assert.deepEqual(api.keys, [k2.publicHex, k2.publicHex, api.keys[2]]); assert.notEqual(api.keys[2], k2.publicHex);
});
test('start: a scratch folder in a parent the worker cannot write (root-owned /data) is emptied, not removed, and the key is published', async t => {
  const d = await tmp(t); const data = path.join(d, 'data'); const scratch = path.join(data, '.vibyra-tmp');
  await fs.mkdir(scratch, { recursive: true }); await fs.writeFile(path.join(scratch, 'left-over.sealed'), 'x');
  const api = await fakeApi(t); const paths = { home: path.join(d, 'h'), projects: path.join(d, 'p'), shadow: path.join(d, 's'), tmp: scratch, syncDir: path.join(d, 'sync') };
  // Restored before the test ends: tmp(t)'s cleanup hook runs first and could not remove a read-only folder.
  await fs.chmod(data, 0o555);
  try { await createSyncEngine({ client: new SyncClient(api.url, 'ws', TOKEN), paths }).start(); } finally { await fs.chmod(data, 0o755); }
  assert.deepEqual(await fs.readdir(scratch), []); assert.equal(api.keys.length, 1);
});
test('client: https only (http only on loopback), no redirects, token re-read per call', async t => {
  assert.throws(() => new SyncClient('http://api.example', 'ws', 'x'), /HTTPS/); assert.throws(() => new SyncClient('https://u:p@api.example', 'ws', 'x'), /HTTPS/); assert.doesNotThrow(() => new SyncClient('https://api.example', 'ws', 'x'));
  const api = await fakeApi(t); let token = 'wrong'; const c = new SyncClient(api.url, 'ws', () => token); await assert.rejects(c.macs(), e => e.status === 401); token = TOKEN; assert.deepEqual((await c.macs()).macs, []);
});
test('worker process: boots as a child, drains the inbox before reporting drained, reads the token from its file, and runs the final pass', async t => {
  const root = await tmp(t); const api = await fakeApi(t); const mac = await macRepo(t);
  const paths = { home: path.join(root, 'home'), projects: path.join(root, 'projects'), shadow: path.join(root, 'shadow'), syncTmp: path.join(root, 'tmp'), syncDir: path.join(root, 'sync') };
  for (const d of [paths.home, paths.projects, paths.shadow, paths.syncTmp]) await fs.mkdir(d);
  const tokenFile = path.join(root, 'token'); await fs.writeFile(tokenFile, `${TOKEN}\n`);
  const keyPair = await ensureKey(paths.syncDir); const macKeys = generateKeyPair(); api.macs.push({ id: 'mac-1', publicKey: macKeys.public.toString('hex') });
  enqueue(api, await mac.snapshot(keyPair.publicHex, { 'hello.txt': 'from the Mac' })); api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 });
  const sp = createSyncProcess({ paths, origin: api.url, workspace: 'ws', tokenFile, worker, bootMs: 20000 });
  assert.equal(await sp.boot(), 'drained'); assert.equal(await fs.readFile(path.join(paths.projects, 'proj/hello.txt'), 'utf8'), 'from the Mac');
  assert.deepEqual(api.applied.map(a => a.body.state), ['synced']); assert.equal(api.badToken, 0);
  await fs.writeFile(path.join(paths.projects, 'proj/hello.txt'), 'edited on the VM');
  const out = await sp.final(8000); assert.deepEqual(out, [['proj', true]]); assert.equal(sp.running, false);
  const up = api.uploads.find(u => u.kind === 'code'); assert.ok(up); const b = await openBuffer(macKeys.secret, up.body); assert.ok(b.subarray(0, 4).toString() === 'PACK' || b.toString('latin1', 0, 16).startsWith('# v'));
  await sp.halt();
});
test('supervisor side: the worker is spawned as the project uid/gid with a fixed env and no token; a failing boot is bounded; halt prevents restarts', async t => {
  const seen = []; const spawned = []; const fakeSpawn = (cmd, args, opts) => { seen.push({ args, opts }); const c = new EventEmitter(); c.stdout = new EventEmitter(); c.kill = () => {}; spawned.push(c); return c; };
  const sp = createSyncProcess({ paths: { home: '/data/home', projects: '/data/projects', shadow: '/data/.vibyra-shadow', syncTmp: '/data/.vibyra-tmp', syncDir: '/data/.vibyra-sync' }, origin: 'https://api.example', workspace: 'ws-1', tokenFile: '/run/vibyra/runtime-token', uid: 1001, gid: 1001, spawn: fakeSpawn, bootMs: 50, restartMs: 10 });
  assert.equal(await sp.boot(), 'timeout'); const { opts, args } = seen[0]; assert.deepEqual([opts.uid, opts.gid, opts.detached, opts.cwd], [1001, 1001, true, '/']); assert.equal(args[1], 'serve');
  assert.deepEqual(Object.keys(opts.env).sort(), ['GIT_TERMINAL_PROMPT', 'HOME', 'LANG', 'PATH', 'TMPDIR', 'VIBYRA_SYNC_CFG']); assert.doesNotMatch(JSON.stringify(opts.env), /token-value|Bearer|secret/i);
  assert.equal(JSON.parse(opts.env.VIBYRA_SYNC_CFG).tokenFile, '/run/vibyra/runtime-token'); assert.equal(JSON.parse(opts.env.VIBYRA_SYNC_CFG).paths.tmp, '/data/.vibyra-tmp');
  spawned[0].emit('exit', 1); await sleep(40); assert.ok(seen.length >= 2, 'restarted after an unexpected exit'); const n = seen.length; await sp.halt(); spawned.at(-1).emit('exit', 0); await sleep(40); assert.equal(seen.length, n);
});
