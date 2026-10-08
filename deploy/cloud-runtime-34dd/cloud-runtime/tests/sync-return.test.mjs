import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { vmSetup, macRepo, enqueue, write, g, tmp, transcriptsBlob } from './sync-helpers.mjs';
import { openBuffer, generateKeyPair } from '../src/sync-crypto.mjs';
import { snapshotProject } from '../src/sync-snapshot.mjs';

// Mac side of the return path: open one upload, fetch it into the Mac repo, return the cloud head.
async function macFetch(t, vm, mac, up) {
  const dir = await tmp(t); const f = path.join(dir, 'c.bundle'); await fs.writeFile(f, await openBuffer(vm.mac.secret, up.body));
  g(mac.work, 'fetch', '-q', f, '+refs/vibyra/cloud:refs/vibyra/cloud'); return g(mac.work, 'rev-parse', 'refs/vibyra/cloud');
}
async function applied(t, files = { 'a.txt': '1', 'src/b.js': 'b', '.gitignore': 'dist/\n' }) {
  const vm = await vmSetup(t); const mac = await macRepo(t); const s1 = await mac.snapshot(vm.vmKey.publicHex, files);
  enqueue(vm.api, s1); await vm.engine.drain(); vm.api.projects.push({ name: 'proj', downSeq: 0, transcriptsDownSeq: 0 }); return { vm, mac, s1 };
}

test('return snapshot: full first, then incremental against the previous cloud head; unchanged trees send nothing', async t => {
  const { vm, mac } = await applied(t);
  assert.deepEqual(await snapshotProject(vm.engine.ctx, 'proj'), { sent: false, reason: 'unchanged' });
  await write(vm.wt('proj'), { 'a.txt': 'edited on the VM', 'new/c.txt': 'c', 'dist/out.js': 'ignored', 'src/b.js': null });
  const r1 = await snapshotProject(vm.engine.ctx, 'proj'); assert.equal(r1.sent, true); assert.equal(vm.api.uploads.length, 1);
  const u1 = vm.api.uploads[0]; assert.deepEqual([u1.kind, u1.seq, u1.baseSeq, u1.mac, u1.head], ['code', 1, 0, 'mac-1', r1.head]); assert.equal(Number(u1.length), u1.body.length);
  assert.equal(await macFetch(t, vm, mac, u1), r1.head);
  assert.deepEqual(g(mac.work, 'ls-tree', '-r', '--name-only', 'refs/vibyra/cloud').split('\n'), ['.gitignore', 'a.txt', 'new/c.txt']);
  assert.equal(g(mac.work, 'show', 'refs/vibyra/cloud:a.txt'), 'edited on the VM'); assert.match(g(mac.work, 'log', '-1', '--format=%B', 'refs/vibyra/cloud'), /Vibyra-Base: [0-9a-f]{40}/);
  assert.deepEqual(await snapshotProject(vm.engine.ctx, 'proj'), { sent: false, reason: 'unchanged' });
  await write(vm.wt('proj'), { 'new/c.txt': 'c2' }); const r2 = await snapshotProject(vm.engine.ctx, 'proj'); const u2 = vm.api.uploads[1];
  assert.deepEqual([u2.seq, u2.baseSeq], [2, 1]);
  assert.equal(await macFetch(t, vm, mac, u2), r2.head); assert.equal(g(mac.work, 'show', 'refs/vibyra/cloud:new/c.txt'), 'c2'); assert.equal(g(mac.work, 'rev-parse', 'refs/vibyra/cloud~1'), r1.head);
});
test('snapshot rules: no .git, symlinks, over-cap files or new secrets; a known secret keeps being returned; modes survive', async t => {
  const { vm, mac } = await applied(t, { 'a.txt': '1', '.env': 'KNOWN=1' }); const wt = vm.wt('proj'); const outside = await tmp(t);
  await write(wt, { '.git/config': '[core]', 'link': { link: outside }, 'run.sh': { data: '#!/bin/sh', mode: 0o755 }, '.env.local': 'SECRET=1', 'key.pem': 'k', 'ok.txt': 'ok', '.env.example': 'X=' });
  await fs.writeFile(path.join(wt, 'big.bin'), Buffer.alloc(20 * 1024 * 1024 + 1)); await fs.writeFile(path.join(wt, 'exactly.bin'), Buffer.alloc(20 * 1024 * 1024));
  const r = await snapshotProject(vm.engine.ctx, 'proj'); assert.equal(r.sent, true); await macFetch(t, vm, mac, vm.api.uploads[0]);
  assert.deepEqual(g(mac.work, 'ls-tree', '-r', '--name-only', 'refs/vibyra/cloud').split('\n'), ['.env', '.env.example', 'a.txt', 'exactly.bin', 'ok.txt', 'run.sh']);
  assert.match(g(mac.work, 'ls-tree', 'refs/vibyra/cloud', 'run.sh'), /^100755/);
});
test('byte exactness: CRLF, .gitattributes filters and a hostile gitconfig are never applied to what is returned', async t => {
  const { vm, mac } = await applied(t); const wt = vm.wt('proj');
  await write(wt, { 'crlf.txt': 'a\r\nb\r\n', '.gitattributes': '* text eol=lf filter=evil\n', 'x.txt': 'x\n' });
  await fs.mkdir(path.join(wt, '.git'), { recursive: true }); await fs.writeFile(path.join(wt, '.git/config'), '[core]\n\thooksPath = /tmp/evil\n[filter "evil"]\n\tclean = touch /tmp/PWNED-by-vibyra-test\n');
  await snapshotProject(vm.engine.ctx, 'proj'); await macFetch(t, vm, mac, vm.api.uploads[0]);
  assert.equal(g(mac.work, 'cat-file', '-s', 'refs/vibyra/cloud:crlf.txt'), '6'); assert.equal(g(mac.work, 'cat-file', '-s', 'refs/vibyra/cloud:x.txt'), '2');
  assert.equal(await fs.stat('/tmp/PWNED-by-vibyra-test').catch(() => null), null);
});
test('a failed upload rolls the cloud ref back, retries with the same seq, and nothing is recorded as sent', async t => {
  const { vm } = await applied(t); const sg = await import('../src/sync-git.mjs'); const shadow = path.join(vm.paths.shadow, 'proj.git'); const sh = sg.shadowGit({ home: vm.paths.home, shadow });
  await write(vm.wt('proj'), { 'a.txt': 'edit' }); const orig = vm.client.upload.bind(vm.client); vm.client.upload = async () => { throw Object.assign(Error('down'), { status: 503 }); };
  await assert.rejects(snapshotProject(vm.engine.ctx, 'proj'), /down/); assert.equal(await sg.revParse(sh, 'refs/vibyra/cloud'), null); assert.equal((await vm.engine.ctx.state.get('proj')).cloudHead, undefined);
  vm.client.upload = orig; const r = await snapshotProject(vm.engine.ctx, 'proj'); assert.equal(r.seq, 1); assert.equal(vm.api.uploads.length, 1);
});
test('one sealed upload per registered Mac, each openable only by its own key; no Macs means nothing is created', async t => {
  const { vm } = await applied(t); const second = generateKeyPair(); await write(vm.wt('proj'), { 'a.txt': 'edit' });
  vm.api.macs.length = 0; assert.deepEqual(await snapshotProject(vm.engine.ctx, 'proj'), { sent: false, reason: 'no_macs' }); assert.equal(vm.api.uploads.length, 0);
  vm.api.macs.push({ id: 'mac-1', publicKey: vm.mac.public.toString('hex') }, { id: 'mac-2', publicKey: second.public.toString('hex') });
  await snapshotProject(vm.engine.ctx, 'proj'); assert.deepEqual(vm.api.uploads.map(u => u.mac), ['mac-1', 'mac-2']);
  const [a, b] = vm.api.uploads; assert.notEqual(a.sha256, b.sha256); assert.deepEqual(await openBuffer(vm.mac.secret, a.body), await openBuffer(second.secret, b.body));
  await assert.rejects(openBuffer(vm.mac.secret, b.body)); assert.equal(a.seq, b.seq);
});
test('projects the VM never applied (no shadow repo) are never snapshotted', async t => {
  const vm = await vmSetup(t); await write(vm.wt('cloned'), { 'x.txt': 'x' }); assert.deepEqual(await snapshotProject(vm.engine.ctx, 'cloned'), { sent: false, reason: 'no_shadow' });
  assert.deepEqual(await snapshotProject(vm.engine.ctx, '../x'), { sent: false, reason: 'bad_name' });
});

const claudeLine = (cwd, extra = {}) => JSON.stringify({ type: 'user', cwd, sessionId: 's1', message: { content: `cwd mentioned: ${cwd}` }, ...extra });
test('transcripts apply: JSON-aware cwd rewrite into $HOME placement, newer VM copy wins, and the Mac cwd is remembered', async t => {
  const vm = await vmSetup(t); const sid = '11111111-1111-1111-1111-111111111111', cid = '22222222-2222-2222-2222-222222222222'; const macRoot = '/Users/me/code/app';
  const codexName = `rollout-2026-09-30T10-11-12-${cid}.jsonl`;
  const claude = `${claudeLine(macRoot)}\n${claudeLine(`${macRoot}/sub`)}\n${claudeLine('/elsewhere')}\nnot json "cwd" at all\n`;
  const codex = `${JSON.stringify({ type: 'session_meta', payload: { cwd: macRoot, id: cid }, cwd: macRoot })}\n${JSON.stringify({ type: 'event', payload: { cwd: macRoot } })}\n`;
  const manifest = { project: 'proj', sessions: [{ provider: 'claude', id: sid, file: `claude/${sid}.jsonl`, cwd: macRoot, mtime: 1790000000 }, { provider: 'codex', id: cid, file: `codex/${codexName}`, cwd: macRoot, mtime: 1790000000 }] };
  const blob = await transcriptsBlob(vm.vmKey.publicHex, 'tr-1', manifest, [{ name: `claude/${sid}.jsonl`, data: claude, mtime: 1790000000 }, { name: `codex/${codexName}`, data: codex, mtime: 1790000000 }]);
  enqueue(vm.api, blob); await vm.engine.drain(); assert.deepEqual(vm.api.applied.at(-1).body, { ok: true });
  const root = path.join(vm.paths.projects, 'proj'); const cf = path.join(vm.paths.home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'), `${sid}.jsonl`);
  const lines = (await fs.readFile(cf, 'utf8')).split('\n'); assert.equal(JSON.parse(lines[0]).cwd, root); assert.equal(JSON.parse(lines[0]).message.content, `cwd mentioned: ${macRoot}`); // only the cwd field changes
  assert.equal(JSON.parse(lines[1]).cwd, `${root}/sub`); assert.equal(JSON.parse(lines[2]).cwd, '/elsewhere'); assert.equal(lines[3], 'not json "cwd" at all');
  assert.equal(Math.floor((await fs.stat(cf)).mtimeMs / 1000), 1790000000);
  const cx = path.join(vm.paths.home, '.codex/sessions/2026/09/30', codexName); const cl = (await fs.readFile(cx, 'utf8')).split('\n');
  assert.equal(JSON.parse(cl[0]).payload.cwd, root); assert.equal(JSON.parse(cl[0]).cwd, root); assert.equal(JSON.parse(cl[1]).payload.cwd, macRoot); // non-session_meta payload untouched
  assert.equal((await vm.engine.ctx.state.get('proj')).macCwd, macRoot);
  // newer-mtime-wins: the VM continued the chat, an older copy from the Mac must not clobber it.
  await fs.appendFile(cf, `${claudeLine(root)}\n`); const keep = await fs.readFile(cf, 'utf8');
  const again = await transcriptsBlob(vm.vmKey.publicHex, 'tr-2', manifest, [{ name: `claude/${sid}.jsonl`, data: claude, mtime: 1790000000 }]); enqueue(vm.api, again); await vm.engine.drain();
  assert.equal(await fs.readFile(cf, 'utf8'), keep);
});
test('transcripts: bad manifests, traversal names and foreign projects place nothing', async t => {
  const vm = await vmSetup(t); const id = '33333333-3333-3333-3333-333333333333';
  const evil = await transcriptsBlob(vm.vmKey.publicHex, 'tr-evil', { project: 'proj', sessions: [{ provider: 'claude', id: '../../x', file: 'claude/../../x.jsonl', cwd: '/a', mtime: 1 }] }, [{ name: 'claude/../../x.jsonl', data: 'x\n' }]);
  const foreign = await transcriptsBlob(vm.vmKey.publicHex, 'tr-foreign', { project: 'other', sessions: [{ provider: 'claude', id, file: `claude/${id}.jsonl`, cwd: '/a', mtime: 1 }] }, [{ name: `claude/${id}.jsonl`, data: 'x\n' }]);
  foreign.item.project = 'proj'; foreign.item.seq = 2; enqueue(vm.api, evil, foreign); await vm.engine.drain();
  assert.deepEqual(vm.api.applied.map(a => a.body.ok), [true, false]); assert.deepEqual(await fs.readdir(vm.paths.home), []);
});
test('transcripts return: sessions created on the VM go back with cwd mapped to the Mac root (unchanged when no Mac cwd is known); unchanged ones are not resent', async t => {
  const { vm } = await applied(t); const root = path.join(vm.paths.projects, 'proj'); const dir = path.join(vm.paths.home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  const sid = '44444444-4444-4444-4444-444444444444'; await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, `${sid}.jsonl`), `${claudeLine(root)}\n`);
  const cdir = path.join(vm.paths.home, '.codex/sessions/2026/10/01'); const cname = 'rollout-2026-10-01T09-00-00-55555555-5555-5555-5555-555555555555.jsonl'; await fs.mkdir(cdir, { recursive: true });
  await fs.writeFile(path.join(cdir, cname), `${JSON.stringify({ type: 'session_meta', payload: { cwd: root } })}\n`);
  await fs.writeFile(path.join(cdir, 'rollout-2026-10-01T09-00-00-66666666-6666-6666-6666-666666666666.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { cwd: '/some/other/project' } })}\n`);
  const { returnTranscripts } = await import('../src/sync-snapshot.mjs'); const { extractTar } = await import('../src/sync-tar.mjs');
  const open = async up => { const d = await tmp(t); await fs.writeFile(path.join(d, 't.tar'), await openBuffer(vm.mac.secret, up.body)); const names = await extractTar(path.join(d, 't.tar'), d); return { d, names }; };
  assert.equal((await returnTranscripts(vm.engine.ctx, 'proj')).sent, true); const up = vm.api.uploads[0]; assert.deepEqual([up.kind, up.seq, up.baseSeq, up.head], ['transcripts', 1, 0, '-']);
  let { d, names } = await open(up); assert.deepEqual(names.sort(), [`claude/${sid}.jsonl`, `codex/${cname}`, 'manifest.json'].sort());
  assert.equal(JSON.parse((await fs.readFile(path.join(d, `claude/${sid}.jsonl`), 'utf8')).trim()).cwd, root); // fallback: unchanged
  assert.deepEqual(await returnTranscripts(vm.engine.ctx, 'proj'), { sent: false, reason: 'unchanged' });
  await vm.engine.ctx.state.set('proj', { macCwd: '/Users/me/app' }); await new Promise(r => setTimeout(r, 20)); await fs.appendFile(path.join(dir, `${sid}.jsonl`), `${claudeLine(`${root}/pkg`)}\n`);
  assert.equal((await returnTranscripts(vm.engine.ctx, 'proj')).sent, true); ({ d, names } = await open(vm.api.uploads[1])); assert.deepEqual(names.sort(), [`claude/${sid}.jsonl`, 'manifest.json']);
  const ls = (await fs.readFile(path.join(d, `claude/${sid}.jsonl`), 'utf8')).trim().split('\n').map(l => JSON.parse(l).cwd); assert.deepEqual(ls, ['/Users/me/app', '/Users/me/app/pkg']);
  const man = JSON.parse(await fs.readFile(path.join(d, 'manifest.json'), 'utf8')); assert.equal(man.project, 'proj'); assert.equal(man.sessions[0].cwd, '/Users/me/app'); assert.equal(vm.api.uploads[1].seq, 2);
  const vmAt = Math.floor((await fs.stat(path.join(dir, `${sid}.jsonl`))).mtimeMs / 1000);
  assert.deepEqual(man.sessions[0], { provider: 'claude', id: sid, file: `claude/${sid}.jsonl`, cwd: '/Users/me/app', mtime: vmAt, ranIn: 'cloud', cloudAt: vmAt });
});
