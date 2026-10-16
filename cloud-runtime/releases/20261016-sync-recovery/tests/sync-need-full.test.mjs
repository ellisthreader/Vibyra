import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { vmSetup, macRepo, enqueue, write, g, tmp } from './sync-helpers.mjs';
import { openBuffer, generateKeyPair } from '../src/sync-crypto.mjs';
import { extractTar } from '../src/sync-tar.mjs';
import { snapshotProject, returnTranscripts } from '../src/sync-snapshot.mjs';

// The Mac refuses a down blob with `applied:false, needFull:true`; the account then says so in GET state
// (`downNeedFull` / `transcriptsNeedFull`) and the VM answers with a full bundle / every conversation again.
async function applied(t) {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1', 'src/b.js': 'b' });
  enqueue(vm.api, s1); await vm.engine.drain(); vm.api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 }); return { vm, mac };
}
const flag = (vm, patch) => Object.assign(vm.api.projects.find(p => p.name === 'proj'), patch);
const files = new Map();
const await_ = up => files.get(up);

test('a refused code blob is answered with a full, parentless bundle even when the tree did not change, then not again at once', async t => {
  const { vm, mac } = await applied(t); const ctx = vm.engine.ctx;
  await write(vm.wt('proj'), { 'a.txt': 'edit 1' }); assert.equal((await snapshotProject(ctx, 'proj')).sent, true);
  await write(vm.wt('proj'), { 'a.txt': 'edit 2' }); assert.equal((await snapshotProject(ctx, 'proj')).sent, true);
  const [first, second] = vm.api.uploads; assert.deepEqual([first.baseSeq, second.baseSeq], [0, 1], 'the second is an increment');
  // The Mac refused the first and so could not use the second either: needFull. Nothing changed since.
  flag(vm, { downNeedFull: true });
  const r = await snapshotProject(ctx, 'proj'); assert.equal(r.sent, true); assert.equal(r.full, true);
  const third = vm.api.uploads.at(-1); assert.equal(third.baseSeq, 0, 'a full bundle');
  for (const up of [second, third]) { const d = await tmp(t); const f = path.join(d, 'c.bundle'); await fs.writeFile(f, await openBuffer(vm.mac.secret, up.body)); files.set(up, f); }
  // The Mac never had the first cloud commit: the increment cannot be used there, the full bundle can.
  assert.throws(() => g(mac.work, 'bundle', 'verify', await_(second)), /./);
  g(mac.work, 'bundle', 'verify', await_(third));
  assert.equal((await ctx.state.get('proj')).cloudHead, r.head);
  // Refused again straight away: not re-sent in a loop.
  assert.deepEqual(await snapshotProject(ctx, 'proj'), { sent: false, reason: 'full_backoff' });
  assert.equal(vm.api.uploads.length, 3);
  // The Mac took it (the account no longer flags): back to increments and "unchanged".
  flag(vm, { downNeedFull: false });
  assert.deepEqual(await snapshotProject(ctx, 'proj'), { sent: false, reason: 'unchanged' });
});

test('without the flag nothing about the return path changes: unchanged trees send nothing', async t => {
  const { vm } = await applied(t);
  assert.deepEqual(await snapshotProject(vm.engine.ctx, 'proj'), { sent: false, reason: 'unchanged' });
  assert.equal(vm.api.uploads.length, 0);
});

test('a refused conversations blob sends every conversation again, once per back-off, and the regular pass retries a refused code blob', async t => {
  const { vm } = await applied(t); const ctx = vm.engine.ctx; const root = path.join(vm.paths.projects, 'proj');
  const dir = path.join(vm.paths.home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-')); await fs.mkdir(dir, { recursive: true });
  const sid = '44444444-4444-4444-4444-444444444444'; await fs.writeFile(path.join(dir, `${sid}.jsonl`), `${JSON.stringify({ type: 'user', cwd: root, sessionId: sid, message: { content: 'hi' } })}\n`);
  assert.equal((await returnTranscripts(ctx, 'proj')).sent, true);
  assert.deepEqual(await returnTranscripts(ctx, 'proj'), { sent: false, reason: 'unchanged' });
  flag(vm, { transcriptsNeedFull: true, transcriptsDownSeq: 1 });
  const again = await returnTranscripts(ctx, 'proj'); assert.equal(again.sent, true, 'the same conversation goes again'); const scratch = await tmp(t); const tar = path.join(scratch, 'again.tar');
  await fs.writeFile(tar, await openBuffer(vm.mac.secret, vm.api.uploads.at(-1).body)); await extractTar(tar, scratch);
  assert.equal(JSON.parse(await fs.readFile(path.join(scratch, 'manifest.json'), 'utf8')).sessions[0].id, sid);
  assert.equal(vm.api.uploads.filter(u => u.kind === 'transcripts').length, 2);
  assert.deepEqual(await returnTranscripts(ctx, 'proj'), { sent: false, reason: 'full_backoff' }, 'and not in a loop');
  // A refused code blob is answered by the regular pass too (it runs every few minutes, edits or not).
  flag(vm, { transcriptsNeedFull: false, downNeedFull: true });
  await returnTranscripts(ctx, 'proj'); assert.equal(vm.api.uploads.filter(u => u.kind === 'code').at(-1)?.baseSeq, 0);
});

test('the existing periodic loop resends unchanged code and respects the ten-minute bound', async t => {
  let at = 10_000_000;
  const vm = await vmSetup(t, { now: () => at, watchMs: 1 }); const mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': 'first' })); await vm.engine.drain();
  vm.api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 });
  await write(vm.wt('proj'), { 'a.txt': 'cloud edit' }); await snapshotProject(vm.engine.ctx, 'proj');
  await vm.engine.watchTick(); flag(vm, { downNeedFull: true });
  at += 5 * 60_000; await vm.engine.watchTick();
  assert.equal(vm.api.uploads.length, 2); assert.equal(vm.api.uploads.at(-1).baseSeq, 0);
  at += 5 * 60_000; await vm.engine.watchTick(); assert.equal(vm.api.uploads.length, 2);
  at += 5 * 60_000; await vm.engine.watchTick(); assert.equal(vm.api.uploads.length, 3);
  assert.equal(vm.api.uploads.at(-1).baseSeq, 0);
});

test('transcript recovery reaches each Mac, retains unchanged sessions, and waits ten minutes even if one session changes', async t => {
  const { vm } = await applied(t); let at = 10_000_000; const ctx = vm.engine.ctx; ctx.now = () => at;
  const second = generateKeyPair(); vm.api.macs.push({ id: 'mac-2', publicKey: second.public.toString('hex') });
  const root = vm.wt('proj'); const dir = path.join(vm.paths.home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  await fs.mkdir(dir, { recursive: true });
  for (const id of ['alpha', 'beta']) await fs.writeFile(path.join(dir, `${id}.jsonl`), JSON.stringify({ type: 'user', cwd: root, sessionId: id }) + '\n');
  await returnTranscripts(ctx, 'proj'); flag(vm, { transcriptsNeedFull: true });
  await returnTranscripts(ctx, 'proj'); assert.equal(vm.api.uploads.length, 4);
  const [a, b] = vm.api.uploads.slice(-2); assert.deepEqual([a.mac, b.mac], ['mac-1', 'mac-2']);
  const plain = await openBuffer(vm.mac.secret, a.body); assert.deepEqual(plain, await openBuffer(second.secret, b.body));
  await assert.rejects(openBuffer(vm.mac.secret, b.body));
  const broken = Buffer.from(a.body); broken[broken.length - 1] ^= 1; await assert.rejects(openBuffer(vm.mac.secret, broken));
  await fs.appendFile(path.join(dir, 'alpha.jsonl'), 'changed\n');
  at += 10 * 60_000 - 1;
  assert.deepEqual(await returnTranscripts(ctx, 'proj'), { sent: false, reason: 'full_backoff' }); assert.equal(vm.api.uploads.length, 4);
  at += 1; assert.equal((await returnTranscripts(ctx, 'proj')).sent, true); assert.equal(vm.api.uploads.length, 6);
  const scratch = await tmp(t); const file = path.join(scratch, 'full.tar');
  await fs.writeFile(file, await openBuffer(vm.mac.secret, vm.api.uploads.at(-2).body)); await extractTar(file, scratch);
  const manifest = JSON.parse(await fs.readFile(path.join(scratch, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.sessions.map(s => s.id).sort(), ['alpha', 'beta']);
});

test('a failed full resend does not consume the ten-minute retry and a later success can be retried at the exact boundary', async t => {
  const { vm } = await applied(t); const ctx = vm.engine.ctx; let at = 10_000_000; ctx.now = () => at;
  await write(vm.wt('proj'), { 'a.txt': 'cloud edit' }); await snapshotProject(ctx, 'proj'); flag(vm, { downNeedFull: true });
  const upload = vm.client.upload.bind(vm.client); vm.client.upload = async () => { throw Error('synthetic upload outage'); };
  await assert.rejects(snapshotProject(ctx, 'proj'), /synthetic upload outage/); assert.equal((await ctx.state.get('proj')).fullAt, undefined);
  vm.client.upload = upload; assert.equal((await snapshotProject(ctx, 'proj')).full, true);
  at += 10 * 60_000 - 1; assert.deepEqual(await snapshotProject(ctx, 'proj'), { sent: false, reason: 'full_backoff' });
  at += 1; assert.equal((await snapshotProject(ctx, 'proj')).full, true);
});
