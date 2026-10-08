import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePushRefs, findPush, parsePushArgs, splitGitArgv, parseConfig, realProc } from '../src/push-refs.mjs';
import { startCredentialProxy } from '../src/credential-proxy.mjs';
import { askProxy } from '../src/credential-helper.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UID = 1001;
async function tmp(t) { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-pr-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }
const GIT_ENV = { PATH: process.env.PATH, HOME: '/nonexistent', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/** A real repo: main, vibyra/x (upstream origin/vibyra/x), vibyra/y, tag v1, origin = github URL. */
async function makeRepo(t) {
  const dir = await tmp(t); const repo = path.join(dir, 'repo'); await fs.mkdir(repo);
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'one');
  git(repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git');
  git(repo, 'branch', 'vibyra/x'); git(repo, 'branch', 'vibyra/y'); git(repo, 'tag', 'v1');
  git(repo, 'config', 'branch.vibyra/x.remote', 'origin'); git(repo, 'config', 'branch.vibyra/x.merge', 'refs/heads/vibyra/x');
  git(repo, 'config', 'branch.main.remote', 'origin'); git(repo, 'config', 'branch.main.merge', 'refs/heads/main');
  await fs.mkdir(path.join(repo, 'sub'));
  return repo;
}
/** Fake /proc: helper(100) <- git-remote-https(99) <- git push(98). */
function fakeProc({ argv, cwd, env = { HOME: '/nonexistent', PATH: process.env.PATH, GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null' }, uid = UID, helperUid = UID, chain = true }) {
  const procs = { 100: { argv: ['node', '/opt/vibyra/bin/git-credential-vibyra', 'get'], ppid: 99, uid: helperUid }, 99: { argv: ['git-remote-https', 'origin', 'https://github.com/o/r.git'], ppid: 98, uid },
    98: { argv: ['/usr/bin/git', ...argv], ppid: chain ? 50 : 1, uid, cwd, env }, 50: { argv: ['bash'], ppid: 1, uid } };
  return { cmdline: p => procs[p]?.argv ?? null, ppid: p => procs[p]?.ppid ?? null, cwd: p => procs[p]?.cwd ?? null, ids: p => (procs[p] ? { uid: procs[p].uid, gid: UID } : null), environ: p => procs[p]?.env ?? null };
}
const refsFor = (argv, cwd, opts = {}) => resolvePushRefs(100, { proc: fakeProc({ argv, cwd, ...opts }), expectedUid: UID });
const at = (repo, branch) => { git(repo, 'checkout', '-q', branch); return repo; };

test('push ref derivation matrix against real repos and git config', async t => {
  const repo = await makeRepo(t);
  const X = ['refs/heads/vibyra/x'];
  const allowed = [
    [['push', 'origin', 'vibyra/x'], 'main', X],
    [['push', 'origin', 'refs/heads/vibyra/x'], 'main', X],
    [['push', 'origin', 'HEAD:vibyra/y'], 'vibyra/x', ['refs/heads/vibyra/y']],
    [['push', 'origin', 'HEAD:refs/heads/vibyra/y'], 'main', ['refs/heads/vibyra/y']],
    [['push', 'origin', 'main:vibyra/y'], 'vibyra/x', ['refs/heads/vibyra/y']],
    [['push', 'origin', '+vibyra/x'], 'main', X],
    [['push', 'origin', '+vibyra/x:vibyra/x'], 'main', X],
    [['push'], 'vibyra/x', X], [['push', 'origin'], 'vibyra/x', X],
    [['push', '-u', 'origin', 'HEAD'], 'vibyra/x', X],
    [['push', '-fu', 'origin', 'vibyra/x'], 'main', X],
    [['push', '--force-with-lease', 'origin', 'vibyra/x'], 'main', X],
    [['push', '--force-with-lease=vibyra/x:abc', '-o', 'ci.skip', 'origin', 'vibyra/x'], 'main', X],
    [['push', '--', 'origin', 'vibyra/x'], 'main', X],
    [['push', 'origin', 'vibyra/x', 'vibyra/y'], 'main', ['refs/heads/vibyra/x', 'refs/heads/vibyra/y']],
    [['push', 'origin', 'vibyra/x', 'vibyra/x'], 'main', X],
    [['push', 'https://github.com/o/r.git', 'vibyra/x'], 'main', X],
  ];
  for (const [argv, branch, want] of allowed) { at(repo, branch); assert.deepEqual(await refsFor(argv, repo), want, `${argv.join(' ')} on ${branch}`); }
  at(repo, 'main');
  assert.deepEqual(await refsFor(['-C', 'sub', 'push', 'origin', 'vibyra/x'], repo), X); // -C resolved against the process cwd
  assert.deepEqual(await refsFor(['push', 'origin', 'vibyra/x'], path.join(repo, 'sub')), X);
  const refused = [
    [['push', 'origin', 'HEAD:main'], 'vibyra/x'], [['push', 'origin', '+vibyra/x:main'], 'main'], [['push', 'origin', 'main'], 'main'],
    [['push'], 'main'], [['push', 'origin'], 'main'], // bare push on main with upstream origin/main
    [['push', '--all'], 'vibyra/x'], [['push', '--all', 'origin'], 'vibyra/x'], [['push', '--branches', 'origin'], 'vibyra/x'], [['push', '--mirror', 'origin'], 'vibyra/x'],
    [['push', '--delete', 'origin', 'vibyra/x'], 'main'], [['push', '-d', 'origin', 'vibyra/x'], 'main'], [['push', 'origin', ':vibyra/x'], 'main'], [['push', 'origin', '+:vibyra/x'], 'main'],
    [['push', '--tags'], 'vibyra/x'], [['push', '--tags', 'origin', 'vibyra/x'], 'main'], [['push', '--follow-tags', 'origin', 'vibyra/x'], 'main'], [['push', '--prune', 'origin', 'vibyra/x'], 'main'],
    [['push', 'origin', 'v1'], 'main'], [['push', 'origin', 'refs/tags/v1'], 'main'], [['push', 'origin', 'tag', 'vibyra/x'], 'main'], [['push', 'origin', 'HEAD:refs/tags/vibyra/x'], 'main'],
    [['push', 'origin', 'vibyra/x', 'main'], 'main'], [['push', 'origin', 'vibyra/x', 'HEAD:main'], 'main'], // two refs, one bad
    [['push', 'origin', 'vibyra/nope'], 'main'], // short names need a local branch source
    [['push', 'origin', `${git(repo, 'rev-parse', 'HEAD').trim()}:vibyra/x`], 'main'], [['push', 'origin', 'refs/heads/*:refs/heads/vibyra/*'], 'main'], [['push', 'origin', ':'], 'main'],
    [['push', 'origin', 'refs/heads/vibyra/../main'], 'main'], [['push', 'origin', 'HEAD:refs/heads/vibyra'], 'main'], [['push', 'origin', 'HEAD:refs/heads/vibyra/x.lock'], 'main'],
    [['push', '--receive-pack=evil', 'origin', 'vibyra/x'], 'main'], [['push', '--repo=evil', 'vibyra/x'], 'main'], [['push', '--bogus', 'origin', 'vibyra/x'], 'main'],
    [['push', '--recurse-submodules=on-demand', 'origin', 'vibyra/x'], 'main'], [['-c', 'push.default=current', 'push'], 'vibyra/x'], [['--git-dir=/x', 'push', 'origin', 'vibyra/x'], 'main'],
    [['push', 'origin', 'vibyra/x', '--no-such'], 'main'],
  ];
  for (const [argv, branch] of refused) { at(repo, branch); assert.equal(await refsFor(argv, repo), null, `${argv.join(' ')} on ${branch}`); }
  git(repo, 'checkout', '-q', '--detach'); assert.equal(await refsFor(['push'], repo), null); assert.equal(await refsFor(['push', 'origin', 'HEAD'], repo), null);
  assert.deepEqual(await refsFor(['push', 'origin', 'vibyra/x'], repo), X);
});

test('push.default, upstream and remote config follow git semantics, anything unclear is refused', async t => {
  const repo = await makeRepo(t); at(repo, 'vibyra/x');
  const X = ['refs/heads/vibyra/x'];
  git(repo, 'checkout', '-q', '-b', 'vibyra/new'); // no upstream
  assert.equal(await refsFor(['push'], repo), null); // git itself fails: no upstream under push.default=simple
  git(repo, 'config', 'push.default', 'current'); assert.deepEqual(await refsFor(['push'], repo), ['refs/heads/vibyra/new']);
  git(repo, 'config', 'push.default', 'nothing'); assert.equal(await refsFor(['push'], repo), null);
  git(repo, 'config', 'push.default', 'matching'); assert.equal(await refsFor(['push'], repo), null);
  git(repo, 'config', 'push.default', 'surprise'); assert.equal(await refsFor(['push'], repo), null);
  git(repo, 'config', '--unset', 'push.default');
  git(repo, 'checkout', '-q', 'vibyra/x');
  git(repo, 'config', 'branch.vibyra/x.merge', 'refs/heads/main'); assert.equal(await refsFor(['push'], repo), null); // simple: names differ
  git(repo, 'config', 'push.default', 'upstream'); assert.equal(await refsFor(['push'], repo), null); // upstream is main
  git(repo, 'config', 'branch.vibyra/x.merge', 'refs/heads/vibyra/y'); assert.deepEqual(await refsFor(['push'], repo), ['refs/heads/vibyra/y']);
  git(repo, 'config', 'push.default', 'simple'); assert.equal(await refsFor(['push'], repo), null);
  git(repo, 'config', 'branch.vibyra/x.merge', 'refs/heads/vibyra/x');
  git(repo, 'config', 'push.followTags', 'true'); assert.equal(await refsFor(['push'], repo), null); git(repo, 'config', '--unset', 'push.followTags');
  git(repo, 'config', 'remote.origin.mirror', 'true'); assert.equal(await refsFor(['push'], repo), null); git(repo, 'config', '--unset', 'remote.origin.mirror');
  git(repo, 'config', 'push.recurseSubmodules', 'on-demand'); assert.equal(await refsFor(['push', 'origin', 'vibyra/x'], repo), null); git(repo, 'config', '--unset', 'push.recurseSubmodules');
  git(repo, 'config', 'remote.origin.push', 'refs/heads/*'); assert.equal(await refsFor(['push'], repo), null);
  git(repo, 'config', '--replace-all', 'remote.origin.push', 'HEAD:refs/heads/vibyra/z'); assert.deepEqual(await refsFor(['push'], repo), ['refs/heads/vibyra/z']);
  git(repo, 'config', '--add', 'remote.origin.push', '+vibyra/y:main'); assert.equal(await refsFor(['push', 'origin'], repo), null);
  git(repo, 'config', '--unset-all', 'remote.origin.push');
  git(repo, 'config', 'remote.pushDefault', 'fork'); git(repo, 'remote', 'add', 'fork', 'https://github.com/me/r.git');
  assert.deepEqual(await refsFor(['push'], repo), X); // triangular: pushes the current branch name to the fork
  git(repo, 'checkout', '-q', 'main'); assert.equal(await refsFor(['push'], repo), null);
  assert.equal(await refsFor(['push', 'origin', 'vibyra/x'], repo, { env: { HOME: '/x', GIT_DIR: '/elsewhere' } }), null);
  assert.equal(await refsFor(['push', 'origin', 'vibyra/x'], repo, { env: null }), null);
  assert.equal(await refsFor(['push', 'origin', 'vibyra/x'], path.join(repo, 'missing')), null);
});

test('parsers', () => {
  assert.deepEqual(parsePushArgs(['-u', 'origin', 'a', 'b']), { remote: 'origin', refspecs: ['a', 'b'] });
  assert.deepEqual(splitGitArgv(['-C', '/a', '--no-pager', 'push', 'x']), { dirs: ['/a'], unsafe: false, sub: 'push', rest: ['x'] });
  assert.equal(splitGitArgv(['-c', 'a=b', 'push']).unsafe, true);
  assert.equal(splitGitArgv(['--weird', 'push']).sub, null);
  const cfg = parseConfig('branch.Vibyra/x.Remote\norigin\0push.default\ncurrent\0remote.origin.push\na\0remote.origin.push\nb\0');
  assert.equal(cfg.get('branch.Vibyra/x.remote'), 'origin'); assert.equal(cfg.get('push.default'), 'current'); assert.deepEqual(cfg.all('remote.origin.push'), ['a', 'b']);
});

test('the helper process must really sit under a git push owned by the project user', async t => {
  const repo = await makeRepo(t);
  const opts = proc => ({ proc, expectedUid: UID });
  assert.equal(findPush(100, opts(fakeProc({ argv: ['push', 'origin', 'vibyra/x'], cwd: repo }))).kind, 'push');
  assert.equal(findPush(100, opts(fakeProc({ argv: ['fetch'], cwd: repo }))).kind, 'none');
  assert.equal(findPush(100, opts(fakeProc({ argv: ['clone', 'https://github.com/o/r.git', 'push'], cwd: repo }))).kind, 'none'); // a folder called "push" is not a push
  assert.equal(findPush(100, opts(fakeProc({ argv: ['push'], cwd: repo, uid: 0 }))).kind, 'none'); // ancestor owned by root: not the project's git
  assert.equal(findPush(100, opts(fakeProc({ argv: ['push'], cwd: repo, helperUid: 0 }))), null); // the claimed pid is not a project-user helper
  assert.equal(findPush(99, opts(fakeProc({ argv: ['push'], cwd: repo }))), null); // pid of git-remote-https, not the helper
  assert.equal(findPush(98, opts(fakeProc({ argv: ['push'], cwd: repo }))), null); // the git push itself is not the helper
  assert.equal(findPush(4242, opts(fakeProc({ argv: ['push'], cwd: repo }))), null); // forged pid that does not exist
  assert.equal(findPush(1, opts(fakeProc({ argv: ['push'], cwd: repo }))), null);
  assert.equal(findPush('100', opts(fakeProc({ argv: ['push'], cwd: repo }))), null);
  assert.equal(await resolvePushRefs(100, opts(fakeProc({ argv: ['--odd', 'push', 'origin', 'vibyra/x'], cwd: repo }))), null); // unknown global option: cannot parse with certainty
  assert.equal(await resolvePushRefs(100, opts(fakeProc({ argv: ['fetch'], cwd: repo }))), null);
});

// ---- proxy: per-ref credential calls ----
const backendRule = (log, refuse = () => false) => async q => {
  log.push(q);
  if (refuse(q) || (q.op === 'push' && (!q.branch || !q.branch.startsWith('vibyra/')))) throw Error('refused');
  return { ok: true, username: 'x-access-token', password: `tok-${q.branch ?? q.op}`, expiresAt: 'soon' };
};
test('proxy asks the backend once per derived ref and fails closed', async t => {
  const dir = await tmp(t); const socketPath = path.join(dir, 's.sock'); const log = [];
  let refs = ['refs/heads/vibyra/x']; let refuse = () => false;
  const proxy = await startCredentialProxy({ socketPath, fetchCredential: (...a) => backendRule(log, refuse)(...a), resolvePush: async () => refs }); t.after(() => proxy.close());
  const ask = req => askProxy(socketPath, { repo: 'o/r', ...req });
  assert.equal((await ask({ op: 'push', pid: 100 })).password, 'tok-vibyra/x'); assert.deepEqual(log, [{ repo: 'o/r', op: 'push', branch: 'vibyra/x' }]);
  log.length = 0; refs = ['refs/heads/vibyra/x', 'refs/heads/vibyra/y'];
  assert.equal((await ask({ op: 'push', pid: 100 })).ok, true); assert.deepEqual(log.map(q => q.branch), ['vibyra/x', 'vibyra/y']);
  log.length = 0; refuse = q => q.branch === 'vibyra/y'; const bad = await ask({ op: 'push', pid: 100 });
  assert.equal(bad.ok, false); assert.equal(bad.password, undefined); assert.match(bad.error, /^(denied|unavailable)$/); // any ref refused: no credential at all
  refuse = () => false; log.length = 0;
  assert.equal((await ask({ op: 'push' })).ok, false); assert.equal(log.length, 0); // no pid: no push credential
  assert.equal((await ask({ op: 'push', pid: 'x' })).ok, false);
  assert.equal((await ask({ op: 'push', pid: 100, branch: 'main' })).ok, false); // helper's own branch claim is not trusted either
  refs = null; assert.equal((await ask({ op: 'push', pid: 100 })).ok, false); refs = []; assert.equal((await ask({ op: 'push', pid: 100 })).ok, false);
  refs = ['refs/heads/main']; assert.equal((await ask({ op: 'push', pid: 100 })).ok, false); // the backend still refuses main
  assert.equal(log.at(-1).branch, 'main');
  log.length = 0; assert.equal((await ask({ op: 'fetch', pid: 100 })).password, 'tok-fetch'); assert.deepEqual(log, [{ repo: 'o/r', op: 'fetch' }]);
});

// ---- end to end: a real `git push` (via its pre-push hook, which runs the real helper as a descendant) ----
/** On Linux the real /proc; elsewhere a `ps`/`lsof` adapter, so the real process chain is still exercised. */
const psProc = {
  cmdline: pid => { const r = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }); return r.status === 0 && r.stdout.trim() ? r.stdout.trim().split(/\s+/) : null; },
  ppid: pid => { const r = spawnSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }); return r.status === 0 ? Number(r.stdout.trim()) || null : null; },
  ids: pid => { const r = spawnSync('ps', ['-p', String(pid), '-o', 'uid=,gid='], { encoding: 'utf8' }); const [uid, gid] = r.stdout.trim().split(/\s+/).map(Number); return r.status === 0 ? { uid, gid } : null; },
  cwd: pid => { const r = spawnSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], { encoding: 'utf8' }); return r.stdout.split('\n').find(l => l.startsWith('n'))?.slice(1) ?? null; },
  environ: () => ({ HOME: '/nonexistent', PATH: process.env.PATH, GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null' }),
};
test('end to end: real git push, real helper, root proxy, strict fake backend', async t => {
  const proc = fsSync.existsSync('/proc/self/status') ? realProc : psProc; const uid = process.getuid();
  const dir = await tmp(t); const repo = await makeRepo(t); const bare = path.join(dir, 'remote.git');
  git(dir, 'init', '-q', '--bare', bare); git(repo, 'remote', 'set-url', 'origin', bare);
  const hooks = path.join(dir, 'hooks'); await fs.mkdir(hooks);
  await fs.writeFile(path.join(hooks, 'pre-push'), `#!/bin/sh\nprintf 'protocol=https\\nhost=github.com\\npath=o/r.git\\n\\n' | "$VIBYRA_NODE" "$VIBYRA_HELPER" get > "$VIBYRA_OUT"\nexit 0\n`, { mode: 0o755 });
  git(repo, 'config', 'core.hooksPath', hooks);
  const socketPath = path.join(dir, 'g.sock'); const log = [];
  const proxy = await startCredentialProxy({ socketPath, fetchCredential: backendRule(log), resolvePush: pid => resolvePushRefs(pid, { proc, expectedUid: uid }) }); t.after(() => proxy.close());
  const push = async (branch, args) => {
    at(repo, branch); const out = path.join(dir, 'out'); await fs.rm(out, { force: true }); log.length = 0;
    const r = await new Promise(resolve => { // async: the proxy lives in this process and must keep serving while git runs
      const child = spawn('git', ['push', ...args], { cwd: repo, env: { ...GIT_ENV, VIBYRA_GIT_SOCKET: socketPath, VIBYRA_NODE: process.execPath, VIBYRA_HELPER: path.join(root, 'bin/git-credential-vibyra'), VIBYRA_OUT: out, ...(proc === realProc ? {} : { VIBYRA_GIT_OP: 'push' }) } }); // no /proc here: the helper's own push detection cannot run, the proxy's check still does
      child.on('close', status => resolve({ status }));
    });
    return { status: r.status, got: await fs.readFile(out, 'utf8').catch(() => null), log: [...log] };
  };
  let r = await push('main', ['origin', 'vibyra/x']);
  assert.equal(r.status, 0); assert.match(r.got, /password=tok-vibyra\/x/); assert.deepEqual(r.log, [{ repo: 'o/r', op: 'push', branch: 'vibyra/x' }]);
  r = await push('vibyra/x', []); // bare push, upstream from config
  assert.match(r.got, /password=tok-vibyra\/x/); assert.deepEqual(r.log.map(q => q.branch), ['vibyra/x']);
  r = await push('main', ['origin', 'HEAD:main']); assert.equal(r.got, ''); assert.deepEqual(r.log, []);
  r = await push('main', []); assert.equal(r.got, ''); assert.deepEqual(r.log, []);
  r = await push('vibyra/x', ['origin', 'vibyra/x', 'vibyra/y']); assert.deepEqual(r.log.map(q => q.branch), ['vibyra/x', 'vibyra/y']); assert.match(r.got, /password=/);
  r = await push('vibyra/x', ['--tags', 'origin']); assert.equal(r.got, ''); assert.deepEqual(r.log, []);
});
