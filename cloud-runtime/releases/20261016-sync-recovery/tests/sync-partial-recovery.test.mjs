import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { vmSetup, macRepo, enqueue, write, g, tmp } from './sync-helpers.mjs';
import { openBuffer, generateKeyPair } from '../src/sync-crypto.mjs';
import { extractTar } from '../src/sync-tar.mjs';
import { snapshotProject, returnTranscripts } from '../src/sync-snapshot.mjs';

async function fixture(t) {
  const vm = await vmSetup(t), mac = await macRepo(t);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': 'original', 'src/unchanged.js': 'retained' }));
  await vm.engine.drain();
  vm.api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 });
  return { vm, ctx: vm.engine.ctx, remote: vm.api.projects[0] };
}

test('partial full-code upload preserves retry state and repairs a receiver with no baseline using its own key', async t => {
  const { vm, ctx, remote } = await fixture(t);
  await write(vm.wt('proj'), { 'a.txt': 'cloud edit' });
  await snapshotProject(ctx, 'proj');
  const prior = await ctx.state.get('proj');
  const second = generateKeyPair();
  vm.api.macs.push({ id: 'mac-2', publicKey: second.public.toString('hex') });
  remote.downNeedFull = true;
  const upload = vm.client.upload.bind(vm.client);
  vm.client.upload = async (name, params) => {
    if (params.mac === 'mac-2') throw Error('second recipient unavailable');
    return upload(name, params);
  };
  await assert.rejects(snapshotProject(ctx, 'proj'), /second recipient/);
  assert.equal(vm.api.uploads.length, 2, 'first recipient really received the attempted full resend');
  assert.deepEqual(await ctx.state.get('proj'), prior, 'no cooldown or sent head can commit on partial failure');
  vm.client.upload = upload;
  const result = await snapshotProject(ctx, 'proj');
  assert.equal(result.full, true);
  assert.deepEqual(vm.api.uploads.slice(-2).map(u => [u.mac, u.baseSeq]), [['mac-1', 0], ['mac-2', 0]]);
  const [a, b] = vm.api.uploads.slice(-2);
  const bytes = await openBuffer(second.secret, b.body);
  assert.deepEqual(bytes, await openBuffer(vm.mac.secret, a.body));
  await assert.rejects(openBuffer(vm.mac.secret, b.body));
  const empty = await tmp(t), bundle = path.join(empty, 'full.bundle');
  await fs.writeFile(bundle, bytes);
  g(empty, 'init', '-q'); g(empty, 'bundle', 'verify', bundle);
  g(empty, 'fetch', bundle, 'refs/vibyra/cloud'); g(empty, 'checkout', '--detach', 'FETCH_HEAD');
  assert.equal(await fs.readFile(path.join(empty, 'a.txt'), 'utf8'), 'cloud edit');
  assert.equal(await fs.readFile(path.join(empty, 'src/unchanged.js'), 'utf8'), 'retained');
});

test('partial transcript resend consumes neither sent marks nor cooldown and retries unchanged eligible sessions', async t => {
  const { vm, ctx, remote } = await fixture(t);
  const project = vm.wt('proj');
  const dir = path.join(vm.paths.home, '.claude/projects', project.replace(/[^A-Za-z0-9]/g, '-'));
  await fs.mkdir(dir, { recursive: true });
  for (const id of ['alpha', 'beta']) await fs.writeFile(path.join(dir, `${id}.jsonl`), JSON.stringify({ type: 'user', cwd: project, sessionId: id }) + '\n');
  await returnTranscripts(ctx, 'proj');
  const prior = await ctx.state.get('proj');
  const second = generateKeyPair(); vm.api.macs.push({ id: 'mac-2', publicKey: second.public.toString('hex') });
  remote.transcriptsNeedFull = true;
  const upload = vm.client.upload.bind(vm.client);
  vm.client.upload = async (name, params) => {
    if (params.mac === 'mac-2') throw Error('second transcript recipient unavailable');
    return upload(name, params);
  };
  await assert.rejects(returnTranscripts(ctx, 'proj'), /second transcript/);
  assert.equal(vm.api.uploads.length, 2);
  assert.deepEqual(await ctx.state.get('proj'), prior);
  vm.client.upload = upload;
  assert.equal((await returnTranscripts(ctx, 'proj')).sent, true);
  const [a, b] = vm.api.uploads.slice(-2);
  const bytes = await openBuffer(second.secret, b.body);
  assert.deepEqual(bytes, await openBuffer(vm.mac.secret, a.body));
  await assert.rejects(openBuffer(vm.mac.secret, b.body));
  const dir2 = await tmp(t), tar = path.join(dir2, 'recovered.tar');
  await fs.writeFile(tar, bytes); await extractTar(tar, dir2);
  const manifest = JSON.parse(await fs.readFile(path.join(dir2, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.sessions.map(x => x.id).sort(), ['alpha', 'beta']);
  assert.deepEqual(await returnTranscripts(ctx, 'proj'), { sent: false, reason: 'full_backoff' });
});
