import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureOwnedDir } from '../src/safe-dirs.mjs';
import { createProject } from '../src/projects.mjs';
import { gracefulStop, STOP_GRACE_MS, EXPIRY_GRACE_MS } from '../src/graceful-stop.mjs';
import { HostSupervisor } from '../src/host-process.mjs';

async function tmp(t) { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-sv-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }
const me = process.getuid();
const recorder = () => { const seen = []; return { seen, ops: { chownFd: async (fh, uid, gid) => { seen.push({ ino: (await fh.stat()).ino, uid, gid }); } } }; };

test('H3: a symlink in place of a volume directory is replaced and its target is never chowned', async t => {
  const d = await tmp(t); const data = path.join(d, 'data'); await fs.mkdir(data, { mode: 0o755 });
  const victim = path.join(d, 'etc'); await fs.mkdir(victim); await fs.writeFile(path.join(victim, 'passwd'), 'root');
  const victimIno = (await fs.stat(victim)).ino;
  await fs.symlink(victim, path.join(data, 'projects'));
  const r = recorder(); await ensureOwnedDir(path.join(data, 'projects'), data, { uid: 1001, gid: 1001, trustedUid: me, ops: r.ops });
  const now = await fs.lstat(path.join(data, 'projects'));
  assert.ok(now.isDirectory() && !now.isSymbolicLink());
  assert.equal(r.seen.length, 1); assert.equal(r.seen[0].ino, now.ino); assert.notEqual(r.seen[0].ino, victimIno);
  assert.equal(await fs.readFile(path.join(victim, 'passwd'), 'utf8'), 'root'); assert.equal((await fs.stat(victim)).ino, victimIno);
});
test('H3: a file in place, a missing dir and a real dir are all handled without following anything', async t => {
  const d = await tmp(t); const data = path.join(d, 'data'); await fs.mkdir(data, { mode: 0o755 });
  await fs.writeFile(path.join(data, 'home'), 'x'); await fs.mkdir(path.join(data, 'host'));
  const r = recorder();
  for (const n of ['home', 'host', 'projects']) await ensureOwnedDir(path.join(data, n), data, { uid: 1001, gid: 1001, trustedUid: me, ops: r.ops });
  for (const n of ['home', 'host', 'projects']) assert.ok((await fs.lstat(path.join(data, n))).isDirectory());
  assert.equal(r.seen.length, 3);
});
test('H3: refuses to act when the parent could let uid 1001 swap entries', async t => {
  const d = await tmp(t); const data = path.join(d, 'data'); await fs.mkdir(data); await fs.chmod(data, 0o777);
  const r = recorder();
  await assert.rejects(ensureOwnedDir(path.join(data, 'projects'), data, { uid: 1001, gid: 1001, trustedUid: me, ops: r.ops }), /parent/);
  await fs.chmod(data, 0o755);
  await assert.rejects(ensureOwnedDir(path.join(data, 'projects'), data, { uid: 1001, gid: 1001, trustedUid: me + 1, ops: r.ops }), /parent/);
  assert.equal(r.seen.length, 0); assert.equal(await fs.lstat(path.join(data, 'projects')).catch(() => null), null);
});
test('H3: project clean-up removes a planted symlink itself and every write goes through the project user', async t => {
  const d = await tmp(t); const projects = path.join(d, 'projects'); await fs.mkdir(projects);
  const victim = path.join(d, 'outside'); await fs.mkdir(victim); await fs.writeFile(path.join(victim, 'keep'), '1');
  await fs.symlink(victim, path.join(projects, 'blank'));
  const calls = []; const runAs = async (cmd, args, o) => { calls.push([cmd, o.uid, o.gid]); return (await import('../src/safe-dirs.mjs')).runAsUser(cmd, args, { ...o, uid: null }); };
  await createProject({ name: 'blank' }, { projectsDir: projects, uid: 1001, gid: 1001, runAs });
  assert.ok((await fs.lstat(path.join(projects, 'blank'))).isDirectory());
  assert.equal(await fs.readFile(path.join(victim, 'keep'), 'utf8'), '1');
  assert.deepEqual(calls.map(c => c[0]), ['rm', 'mkdir']); assert.ok(calls.every(c => c[1] === 1001 && c[2] === 1001));
});
test('Low: a clone interrupted mid-way is detected by its marker and redone cleanly', async t => {
  const d = await tmp(t); const env = { PATH: process.env.PATH, HOME: d, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' };
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, env, stdio: 'ignore' });
  g(d, 'init', '-q', '--bare', '-b', 'main', 'r.git'); g(d, 'clone', '-q', 'r.git', 'w'); await fs.writeFile(path.join(d, 'w/f'), '1');
  g(path.join(d, 'w'), 'add', '-A'); g(path.join(d, 'w'), 'commit', '-q', '-m', 'x'); g(path.join(d, 'w'), 'push', '-q', 'origin', 'HEAD:main');
  const projects = path.join(d, 'projects'); await fs.mkdir(path.join(projects, 'app/.git'), { recursive: true }); await fs.writeFile(path.join(projects, 'app/junk'), 'partial');
  await fs.writeFile(path.join(projects, '.app.cloning'), '');
  const cfg = { projectsDir: projects, uid: null, paths: { helper: '/x', hooks: '/y' }, env, retryMs: 1, urlFor: () => `file://${d}/r.git` };
  assert.equal((await createProject({ name: 'app', repo: 'o/r' }, cfg)).existed, false);
  assert.equal(await fs.readFile(path.join(projects, 'app/f'), 'utf8'), '1'); assert.equal(await fs.stat(path.join(projects, 'app/junk')).catch(() => null), null);
  assert.equal(await fs.lstat(path.join(projects, '.app.cloning')).catch(() => null), null);
  // A failed clone leaves nothing behind, so a backend reset to pending retries from scratch.
  await assert.rejects(createProject({ name: 'bad', repo: 'o/r' }, { ...cfg, urlFor: () => 'file:///nonexistent.git', attempts: 2 }));
  assert.equal(await fs.lstat(path.join(projects, 'bad')).catch(() => null), null); assert.equal(await fs.lstat(path.join(projects, '.bad.cloning')).catch(() => null), null);
  assert.equal((await createProject({ name: 'bad', repo: 'o/r' }, cfg)).existed, false);
});

function fake(hostExitsAfterTicks) {
  let t = 0; const log = []; let ticks = 0, killed = false;
  const host = { signal: s => log.push(`host ${s}`), groupAlive: () => hostExitsAfterTicks == null || ticks < hostExitsAfterTicks, kill: () => log.push('host KILL') };
  return { log, host, now: () => t, sleep: async ms => { t += ms; ticks++; }, exec: async (c, a) => { log.push(`${c.split('/').pop()} ${a.join(' ')}`); if (c.endsWith('pkill') && a[0] === '-KILL') killed = true; return c.endsWith('pgrep') ? (killed ? 1 : hostExitsAfterTicks == null || ticks < hostExitsAfterTicks ? 0 : 1) : 0; }, elapsed: () => t };
}
test('M5: stop sends SIGTERM, waits for a clean exit, syncs, then kills only after', async () => {
  const f = fake(3);
  await gracefulStop({ host: f.host, userUid: 1001, graceMs: STOP_GRACE_MS, exec: f.exec, sleep: f.sleep, now: f.now });
  assert.ok(f.elapsed() < STOP_GRACE_MS);
  assert.deepEqual(f.log.filter(l => !l.startsWith('pgrep')), ['host SIGTERM', 'pkill -TERM -u 1001', 'sync ', 'host KILL', 'pkill -KILL -u 1001']);
});
test('M5: stragglers are SIGKILLed once the grace elapses, never earlier and never later', async () => {
  for (const grace of [STOP_GRACE_MS, EXPIRY_GRACE_MS]) {
    const f = fake(null);
    await gracefulStop({ host: f.host, userUid: 1001, graceMs: grace, exec: f.exec, sleep: f.sleep, now: f.now });
    assert.ok(f.elapsed() >= grace && f.elapsed() <= grace + 100, `${grace} -> ${f.elapsed()}`);
    assert.ok(f.log.indexOf('sync ') < f.log.indexOf('host KILL'));
  }
  assert.equal(STOP_GRACE_MS, 10000); assert.ok(EXPIRY_GRACE_MS <= 5000 && EXPIRY_GRACE_MS < STOP_GRACE_MS);
});
test('M5: a real Host group gets SIGTERM and can exit cleanly (flush) before any kill', async t => {
  const d = await tmp(t); const out = path.join(d, 'out');
  const script = path.join(d, 'h.mjs'); await fs.writeFile(script, `import fs from 'node:fs';process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(out)},'flushed');process.exit(0)});setInterval(()=>{},1000);fs.writeFileSync(${JSON.stringify(out + '.up')},'1');`);
  const sup = new HostSupervisor({ bin: process.execPath, args: [script], env: { PATH: process.env.PATH }, valid: () => true });
  sup.start(); t.after(() => sup.kill());
  for (let i = 0; i < 100 && !(await fs.stat(out + '.up').catch(() => null)); i++) await new Promise(r => setTimeout(r, 30));
  await gracefulStop({ host: sup, graceMs: 3000, exec: async () => 0 });
  assert.equal(await fs.readFile(out, 'utf8'), 'flushed'); assert.equal(sup.groupAlive(), false);
});

test('nft rules match uid 1001 positively (kernel-originated IPv6 neighbour discovery has no skuid)', async () => {
  const text = await fs.readFile(new URL('../entrypoint.sh', import.meta.url), 'utf8');
  assert.ok(!/skuid\s*!=/.test(text), 'an inverted skuid guard lets socket-less packets fall into the ff00::/8 and fe80::/10 rejects');
  for (const line of text.split('\n').filter(l => !l.trim().startsWith('#') && /\b(accept|reject)\b/.test(l) && !/oif lo|policy accept/.test(l))) assert.match(line, /meta skuid 1001/, line);
});
