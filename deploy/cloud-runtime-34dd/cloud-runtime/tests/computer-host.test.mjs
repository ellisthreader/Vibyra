import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HostSupervisor, hostArgs, hostEnv, writeTokenFile } from '../src/host-process.mjs';
import { validProject, createProject, drainProjects } from '../src/projects.mjs';

async function tmp(t) { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-ch-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (f, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await sleep(20); } return false; };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const cfg = { apiBase: 'https://api.example', workspaceId: 'ws-1', tokenFile: '/run/vibyra/runtime-token', stateDir: '/data/host', projectsDir: '/data/projects' };

test('host args use the contract flags and carry no secret', () => {
  const args = hostArgs(cfg);
  assert.deepEqual(args.slice(0, 4), ['--account-mode', '--api-base', 'https://api.example', '--workspace-id']);
  for (const f of ['--runtime-token-file', '--state-dir', '--projects-dir', '--activity-interval']) assert.ok(args.includes(f));
  assert.equal(args[args.indexOf('--activity-interval') + 1], '15');
  assert.doesNotMatch(args.join(' '), /bootstrap|token-value|Bearer/i);
});
test('host environment is fixed and drops every supervisor secret', () => {
  const secrets = { VIBYRA_BOOTSTRAP: 'b', VIBYRA_LEASE_PUBLIC_KEY: 'k', FLY_API_TOKEN: 'f', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', AWS_SECRET_ACCESS_KEY: 's', GITHUB_TOKEN: 'g', CLAUDE_CODE_OAUTH_TOKEN: 'c' };
  Object.assign(process.env, secrets); t_cleanup(secrets);
  const env = hostEnv({ home: '/data/home', gitconfig: '/etc/gitconfig', socket: '/run/vibyra/git.sock' });
  assert.equal(env.HOME, '/data/home'); assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  for (const k of Object.keys(secrets)) assert.equal(k in env, false);
  assert.deepEqual(Object.keys(env).sort(), ['GIT_CONFIG_SYSTEM', 'GIT_TERMINAL_PROMPT', 'HOME', 'LANG', 'PATH', 'TMPDIR', 'VIBYRA_CLOUD_COMPUTER', 'VIBYRA_GIT_SOCKET']);
});
function t_cleanup(secrets) { test.after(() => { for (const k of Object.keys(secrets)) delete process.env[k]; }); }

test('runtime token file is read-only for the group and never world readable', async t => {
  const d = await tmp(t); const f = path.join(d, 'tok'); await writeTokenFile(f, 'secret-token');
  assert.equal((await fs.stat(f)).mode & 0o777, 0o440); assert.equal(await fs.readFile(f, 'utf8'), 'secret-token');
});
const fakeHost = async d => { const f = path.join(d, 'fake-host.mjs');
  await fs.writeFile(f, "import fs from 'node:fs';fs.appendFileSync(process.argv[2], process.pid + ' ' + JSON.stringify(Object.keys(process.env).sort()) + '\\n');if (process.argv[3] === 'exit') process.exit(1);setInterval(()=>{},1000);"); return f; };

test('supervisor restarts an exiting host while the lease is valid, with backoff, and stops when invalid', async t => {
  const d = await tmp(t); const script = await fakeHost(d); const log = path.join(d, 'log'); let valid = true;
  const sup = new HostSupervisor({ bin: process.execPath, args: [script, log, 'exit'], env: { PATH: process.env.PATH }, valid: () => valid, backoffMs: [10, 20], stableMs: 60000 });
  sup.start(); t.after(() => sup.kill());
  assert.ok(await until(async () => (await fs.readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).length >= 3)); assert.ok(sup.starts >= 3);
  valid = false; await sleep(100); const n = (await fs.readFile(log, 'utf8')).split('\n').filter(Boolean).length; await sleep(150);
  assert.equal((await fs.readFile(log, 'utf8')).split('\n').filter(Boolean).length, n); // no restart after lease expiry
  // The fake host saw only the sanitised environment keys we passed.
  assert.deepEqual(JSON.parse((await fs.readFile(log, 'utf8')).split('\n')[0].split(' ').slice(1).join(' ')).filter(k => !['PATH'].includes(k) && !k.startsWith('LC_') && k !== '__CF_USER_TEXT_ENCODING'), []);
});
test('kill stops the host process group and prevents a restart', async t => {
  const d = await tmp(t); const script = await fakeHost(d); const log = path.join(d, 'log');
  const sup = new HostSupervisor({ bin: process.execPath, args: [script, log], env: { PATH: process.env.PATH }, valid: () => true, backoffMs: [10] });
  sup.start(); t.after(() => sup.kill());
  assert.ok(await until(() => sup.running)); const pid = sup.child.pid; assert.ok(alive(pid));
  sup.kill(); assert.ok(await until(() => !alive(pid))); await sleep(100); assert.equal(sup.starts, 1); assert.equal(sup.running, false);
});
test('project names and repos are validated', () => {
  for (const ok of [{ name: 'app' }, { name: 'my-app.v2', repo: 'octo/hello', branch: 'feature/x' }]) assert.ok(validProject(ok));
  for (const bad of [{ name: '../x' }, { name: '.hidden' }, { name: 'a/b' }, { name: '' }, { name: 'ok', repo: 'a/../b' }, { name: 'ok', repo: 'https://x/y' }, { name: 'ok', repo: 'a/b', branch: '--upload-pack=x' }, { name: 'x.lock' }, null])
    assert.equal(validProject(bad), false);
});
async function bare(d) {
  const env = { PATH: process.env.PATH, HOME: d, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' };
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, env, stdio: 'ignore' });
  g(d, 'init', '-q', '--bare', '-b', 'main', 'r.git'); g(d, 'clone', '-q', 'r.git', 'w'); await fs.writeFile(path.join(d, 'w/f'), '1'); g(path.join(d, 'w'), 'add', '-A'); g(path.join(d, 'w'), 'commit', '-q', '-m', 'x'); g(path.join(d, 'w'), 'push', '-q', 'origin', 'HEAD:main');
  return env;
}
const paths = { helper: '/nonexistent/helper', hooks: '/nonexistent/hooks' };
test('clone queue: clones into projects dir, creates empty folders, retries then cleans up, reports done', async t => {
  const d = await tmp(t); const env = await bare(d); const projects = path.join(d, 'projects'); await fs.mkdir(projects);
  const base = { projectsDir: projects, uid: null, paths, env, retryMs: 1, urlFor: repo => `file://${d}/${repo.split('/')[1]}.git` };
  await createProject({ name: 'hello', repo: 'octo/r', branch: 'main' }, base); assert.equal(await fs.readFile(path.join(projects, 'hello/f'), 'utf8'), '1');
  assert.equal((await createProject({ name: 'hello', repo: 'octo/r' }, base)).existed, true);
  await createProject({ name: 'blank' }, base); assert.ok((await fs.stat(path.join(projects, 'blank'))).isDirectory());
  await assert.rejects(createProject({ name: 'gone', repo: 'octo/missing' }, { ...base, attempts: 2 })); assert.equal(await fs.stat(path.join(projects, 'gone')).catch(() => null), null);
  const calls = []; const client = { call: async (p, body) => { calls.push([p, body]); return p === '/projects/pending' ? { ok: true, projects: [{ id: 'p1', name: 'again', repo: 'octo/r' }, { id: 'p2', name: '../bad' }] } : { ok: true }; } };
  await drainProjects(client, base);
  assert.deepEqual(calls.slice(1).map(c => [c[0], c[1].ok]), [['/projects/p1/done', true], ['/projects/p2/done', false]]);
});
test('computer mode starts the Host with the token file, serves the git socket, and shutdown kills it and removes the token', async t => {
  const { runComputer } = await import('../src/computer.mjs');
  const d = await tmp(t); const script = await fakeHost(d); const log = path.join(d, 'log');
  // The fake "vibyra-host" is a shell wrapper around node so the supervisor runs a real executable path.
  const bin = path.join(d, 'vibyra-host'); await fs.writeFile(bin, `#!/bin/sh\nexec ${process.execPath} ${script} ${log} "$@"\n`, { mode: 0o755 });
  const paths = { run: path.join(d, 'run'), socket: path.join(d, 'run/git.sock'), tokenFile: path.join(d, 'run/token'), home: path.join(d, 'home'), hostState: path.join(d, 'host'),
    projects: path.join(d, 'projects'), hostBin: bin, gitconfig: '/etc/gitconfig', helper: '/x', hooks: '/y' };
  let stopping = false; const calls = [];
  const client = { token: 'rt-secret', call: async p => { calls.push(p); return p === '/projects/pending' ? { ok: true, projects: [] } : { ok: true, username: 'u', password: 'p' }; } };
  const lease = { active: () => true };
  const c = await runComputer({ client, lease, scope: { workspace: 'ws-9' }, bootstrap: {}, apiOrigin: 'https://api.example', heartbeat: async () => {}, isStopping: () => stopping, paths, uid: 1001, gid: 1001 });
  t.after(() => c.shutdown());
  assert.equal(await fs.readFile(paths.tokenFile, 'utf8'), 'rt-secret'); assert.equal((await fs.stat(paths.tokenFile)).mode & 0o777, 0o440);
  assert.ok(await until(() => c.host.running)); const pid = c.host.child.pid;
  assert.ok(await until(async () => (await fs.readFile(log, 'utf8').catch(() => '')).includes('\n')));
  assert.doesNotMatch(await fs.readFile(log, 'utf8'), /rt-secret/);
  assert.equal((await (await import('../src/credential-helper.mjs')).askProxy(paths.socket, { repo: 'a/b', op: 'fetch' })).ok, true);
  stopping = true; await c.shutdown(); assert.ok(await until(() => !alive(pid)));
  assert.equal(await fs.stat(paths.tokenFile).catch(() => null), null);
});
