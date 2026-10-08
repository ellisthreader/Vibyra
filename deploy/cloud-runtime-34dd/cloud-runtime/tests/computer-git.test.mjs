import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCredentialProxy, checkRequest, apiCredential } from '../src/credential-proxy.mjs';
import { askProxy, runHelper, repoFromInput, parseCredentialInput, detectOp } from '../src/credential-helper.mjs';
import { pushViolation } from '../src/push-guard.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_TOKEN = 'runtime-token-SECRET-123';
async function tmp(t) { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-cg-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }
// A fake runtime API: it holds the runtime token and hands out only a short-lived credential.
const fakeClient = (log = []) => ({ token: RUNTIME_TOKEN, call: async p => { log.push(p); return { ok: true, username: 'x-access-token', password: 'ghs_short', expiresAt: 'soon', token: RUNTIME_TOKEN, extra: 'leak' }; } });

test('proxy returns only username/password/expiry and never the runtime token', async t => {
  const dir = await tmp(t); const socketPath = path.join(dir, 's.sock'); const log = [];
  const proxy = await startCredentialProxy({ socketPath, fetchCredential: apiCredential(fakeClient(log)) }); t.after(() => proxy.close());
  assert.equal((await fs.stat(socketPath)).mode & 0o777, 0o660);
  const reply = await askProxy(socketPath, { repo: 'octo/hello', op: 'fetch' });
  assert.deepEqual(Object.keys(reply).sort(), ['expiresAt', 'ok', 'password', 'username']);
  assert.doesNotMatch(JSON.stringify(reply), new RegExp(RUNTIME_TOKEN)); assert.equal(log[0], '/git/credential?repo=octo%2Fhello&op=fetch');
  // Even smuggled fields in the request cannot change the call or surface the token.
  const sneaky = await askProxy(socketPath, { repo: 'octo/hello', op: 'fetch', token: 'x', path: '/bootstrap' });
  assert.doesNotMatch(JSON.stringify(sneaky), new RegExp(RUNTIME_TOKEN)); assert.equal(log.at(-1), '/git/credential?repo=octo%2Fhello&op=fetch');
});
test('proxy refuses malformed, traversal and non-vibyra push requests and hides upstream failures', async t => {
  const dir = await tmp(t); const socketPath = path.join(dir, 's.sock'); let fail = false;
  const proxy = await startCredentialProxy({ socketPath, fetchCredential: async () => { if (fail) throw Error(`boom ${RUNTIME_TOKEN}`); return { username: 'u', password: 'p' }; } }); t.after(() => proxy.close());
  for (const bad of [{ repo: '../x', op: 'fetch' }, { repo: 'a/b', op: 'delete' }, { repo: 'a/b/c', op: 'fetch' }, { repo: 'a/b', op: 'push', branch: 'main' },
    { repo: 'a/b', op: 'push', branch: 'refs/heads/main' }, { repo: 'a/b', op: 'fetch', branch: 'x y' }, null, 'str'])
    assert.equal(checkRequest(bad), null);
  assert.deepEqual(checkRequest({ repo: 'a/b', op: 'push', branch: 'vibyra/task-1' }), { repo: 'a/b', op: 'push', branch: 'vibyra/task-1' });
  assert.equal((await askProxy(socketPath, { repo: 'a/b', op: 'push', branch: 'main' })).ok, false);
  fail = true; const down = await askProxy(socketPath, { repo: 'a/b', op: 'fetch' });
  assert.deepEqual(down, { ok: false, error: 'unavailable' });
});
test('git credential helper script prints only username and password, nothing for other hosts or store/erase', async t => {
  const dir = await tmp(t); const socketPath = path.join(dir, 's.sock');
  const proxy = await startCredentialProxy({ socketPath, fetchCredential: apiCredential(fakeClient()) }); t.after(() => proxy.close());
  const run = (action, input) => new Promise(resolve => {
    // The helper process gets no runtime token in its environment; only the socket path.
    const child = spawn(process.execPath, [path.join(root, 'bin/git-credential-vibyra'), action], { env: { VIBYRA_GIT_SOCKET: socketPath, VIBYRA_GIT_OP: 'fetch', PATH: process.env.PATH } });
    let out = ''; child.stdout.on('data', c => { out += c; }); child.on('close', () => resolve(out)); child.stdin.end(input);
  });
  const out = await run('get', 'protocol=https\nhost=github.com\npath=octo/hello.git\n\n');
  assert.equal(out, 'username=x-access-token\npassword=ghs_short\n'); assert.doesNotMatch(out, new RegExp(RUNTIME_TOKEN));
  assert.equal(await run('get', 'protocol=https\nhost=evil.example\npath=octo/hello.git\n\n'), '');
  assert.equal(await run('get', 'protocol=http\nhost=github.com\npath=octo/hello.git\n\n'), '');
  assert.equal(await run('store', 'protocol=https\nhost=github.com\npath=octo/hello.git\nusername=u\npassword=p\n\n'), '');
  assert.equal(await run('erase', 'protocol=https\nhost=github.com\npath=octo/hello.git\n\n'), '');
});
test('helper parsing and push detection', async () => {
  assert.equal(repoFromInput(parseCredentialInput('protocol=https\nhost=github.com\npath=octo/hello.git\n')), 'octo/hello');
  assert.equal(repoFromInput(parseCredentialInput('protocol=https\nhost=github.com\npath=../x\n')), null);
  assert.equal(repoFromInput(parseCredentialInput('protocol=https\nhost=github.com\n')), null);
  const asked = []; await runHelper({ action: 'get', input: 'protocol=https\nhost=github.com\npath=a/b\n', op: 'push', ask: async (s, r) => { asked.push(r); return { ok: false }; } });
  assert.deepEqual(asked, [{ repo: 'a/b', op: 'push', pid: process.pid }]);
  const procs = { '/proc/10/cmdline': 'git-remote-https\0origin\0', '/proc/10/stat': '10 (git-remote-http) S 20 ', '/proc/20/cmdline': '/usr/bin/git\0push\0origin\0vibyra/x\0', '/proc/20/stat': '20 (git) S 1 ' };
  assert.equal(detectOp({}, 10, f => (procs[f] ? Buffer.from(procs[f]) : null)), 'push');
  assert.equal(detectOp({}, 10, f => (f.endsWith('cmdline') ? Buffer.from('git\0fetch\0') : null)), 'fetch');
});
test('pre-push guard matrix', () => {
  const sha = 'a'.repeat(40), zero = '0'.repeat(40);
  const line = remote => `refs/heads/work ${sha} ${remote} ${zero}\n`;
  for (const ok of ['refs/heads/vibyra/fix-1', 'refs/heads/vibyra/a/b']) assert.equal(pushViolation(line(ok)), null);
  for (const bad of ['refs/heads/main', 'refs/heads/master', 'refs/heads/vibyra', 'refs/heads/vibyra/', 'refs/heads/vibyrax/y', 'refs/tags/vibyra/v1', 'refs/heads/vibyra/../main', 'refs/heads/feature/vibyra/x', 'refs/for/main'])
    assert.match(pushViolation(line(bad)), /Refusing/);
  assert.match(pushViolation(`${line('refs/heads/vibyra/ok')}${line('refs/heads/main')}`), /refs\/heads\/main/); // one bad ref blocks the whole push
  assert.match(pushViolation(`(delete) ${zero} refs/heads/main ${sha}\n`), /Refusing/);
  assert.equal(pushViolation(''), null);
});
test('real git push through the hook: vibyra/* succeeds, default branch refused', async t => {
  const dir = await tmp(t); const env = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' };
  const g = (cwd, ...a) => execFileSync('git', ['-c', `core.hooksPath=${path.join(root, 'hooks')}`, ...a], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(dir, 'init', '-q', '--bare', '-b', 'main', 'remote.git'); g(dir, 'clone', '-q', 'remote.git', 'work'); const work = path.join(dir, 'work');
  await fs.writeFile(path.join(work, 'a'), '1'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'x');
  g(work, 'push', '-q', 'origin', 'HEAD:refs/heads/vibyra/task');
  const refused = ref => { try { g(work, 'push', '-q', 'origin', `HEAD:${ref}`); return null; } catch (e) { return String(e.stderr); } };
  assert.match(refused('refs/heads/main'), /Refusing to push refs\/heads\/main/); assert.match(refused('refs/tags/v1'), /Refusing/);
  assert.equal(g(dir, '--git-dir=remote.git', 'branch', '--list').trim(), 'vibyra/task');
});
