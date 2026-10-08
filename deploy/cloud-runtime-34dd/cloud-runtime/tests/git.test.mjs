import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cloneEnv, cloneSteps, cloneUrl, cloneSource, headRevision, changedSet, applyChanged, treeFiles } from '../src/git.mjs';
import { safePath } from '../src/files.mjs';

const limits = { files: 100, fileBytes: 100000, projectBytes: 1000000 };
const id = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', PATH: process.env.PATH, HOME: os.tmpdir(), GIT_CONFIG_GLOBAL: '/dev/null' };
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, env: id, encoding: 'utf8' }).trim();
const TOKEN = 'gho_super_secret_token';
async function remote(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-git-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const bare = path.join(dir, 'remote.git'); const work = path.join(dir, 'work');
  sh(dir, 'init', '-q', '--bare', '-b', 'main', bare); sh(dir, 'clone', '-q', bare, work);
  await fs.writeFile(path.join(work, 'a.txt'), 'alpha\n'); await fs.writeFile(path.join(work, 'c.txt'), 'gamma\n'); await fs.writeFile(path.join(work, 'd.txt'), 'delta\n');
  await fs.writeFile(path.join(work, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 }); await fs.writeFile(path.join(work, '.gitignore'), 'ignored.log\nnode_modules\n');
  sh(work, 'add', '-A'); sh(work, 'commit', '-q', '-m', 'one'); sh(work, 'push', '-q', 'origin', 'HEAD:main');
  return { dir, bare, work, url: `file://${bare}`, first: sh(work, 'rev-parse', 'HEAD') };
}
async function clone(t, r, extra = {}) {
  const root = path.join(r.dir, 'project-' + Math.random().toString(36).slice(2)); await fs.mkdir(root);
  const head = await cloneSource({ repo: 'octo/hello', ref: 'main', token: TOKEN, ...extra }, root, { url: r.url });
  return { root, head };
}

test('the token is only ever in the clone environment, never in argv', () => {
  const source = { repo: 'octo/hello', ref: 'main', token: TOKEN };
  const url = cloneUrl(source); assert.equal(url, 'https://github.com/octo/hello.git');
  for (const steps of [cloneSteps(source, url), cloneSteps({ ...source, baseCommit: 'a'.repeat(40) }, url)]) {
    assert.doesNotMatch(JSON.stringify(steps), new RegExp(TOKEN)); assert.doesNotMatch(JSON.stringify(steps), /Authorization|x-access-token/i);
  }
  const first = cloneSteps(source, url)[0];
  for (const flag of ['--depth', '--no-tags']) assert.ok(first.includes(flag)); assert.ok(first.includes('--depth') && first[first.indexOf('--depth') + 1] === '1');
  const env = cloneEnv(TOKEN, url);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0'); assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.equal(env.GIT_CONFIG_VALUE_0, 'Authorization: Basic ' + Buffer.from('x-access-token:' + TOKEN).toString('base64'));
  assert.doesNotMatch(Object.entries(env).filter(([k]) => k !== 'GIT_CONFIG_VALUE_0').map(([, v]) => v).join(' '), new RegExp(TOKEN));
  assert.equal(cloneEnv(null, url).GIT_CONFIG_COUNT, undefined);
});
test('repository and ref are validated before git runs', () => {
  for (const repo of ['nope', 'a/b/c', '../x', 'a/--upload-pack=x', 'a b/c']) assert.throws(() => cloneUrl({ repo }));
  assert.throws(() => cloneSteps({ repo: 'a/b', ref: '--upload-pack=touch x' }, 'https://github.com/a/b.git'));
  assert.throws(() => cloneSteps({ repo: 'a/b', baseCommit: '--bad' }, 'https://github.com/a/b.git'));
});
test('clone from a local bare remote leaves no token on disk and reports the base commit', async t => {
  const r = await remote(t); const { root, head } = await clone(t, r);
  assert.equal(head, r.first); assert.equal(await headRevision(root), r.first);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'alpha\n');
  const config = await fs.readFile(path.join(root, '.git', 'config'), 'utf8'); assert.doesNotMatch(config, new RegExp(TOKEN)); assert.doesNotMatch(config, /extraheader/i);
  assert.equal(sh(root, 'rev-list', '--count', 'HEAD'), '1');
  assert.deepEqual(await changedSet(root, head, limits), { files: [], base: [], baseCommit: head });
  await assert.rejects(cloneSource({ repo: 'octo/hello' }, await fs.mkdtemp(path.join(r.dir, 'x-')), { url: 'file:///nonexistent/repo.git' }));
});
test('changed-set snapshot: edits, additions, deletions, renames, ignores and exclusions', async t => {
  const r = await remote(t); const { root, head } = await clone(t, r);
  await fs.writeFile(path.join(root, 'a.txt'), 'alpha edited\n');
  await fs.writeFile(path.join(root, 'b.txt'), 'beta\n');
  await fs.mkdir(path.join(root, 'sub')); await fs.writeFile(path.join(root, 'sub', 'deep.txt'), 'deep\n');
  await fs.rm(path.join(root, 'c.txt')); await fs.rename(path.join(root, 'd.txt'), path.join(root, 'e.txt'));
  await fs.writeFile(path.join(root, 'ignored.log'), 'noise'); await fs.mkdir(path.join(root, 'node_modules')); await fs.writeFile(path.join(root, 'node_modules', 'x.js'), 'x');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=1'); await fs.chmod(path.join(root, 'run.sh'), 0o644);
  const s = await changedSet(root, head, limits);
  const current = s.files.map(f => f.path); const base = s.base.map(f => f.path);
  assert.deepEqual(current, ['a.txt', 'b.txt', 'e.txt', 'run.sh', 'sub/deep.txt']);
  assert.deepEqual(base, ['a.txt', 'c.txt', 'd.txt', 'run.sh']);
  // Deletions are base paths with no current file.
  assert.deepEqual(base.filter(p => !current.includes(p)), ['c.txt', 'd.txt']);
  const text = (list, p) => Buffer.from(list.find(f => f.path === p).content, 'base64').toString();
  assert.equal(text(s.base, 'a.txt'), 'alpha\n'); assert.equal(text(s.files, 'a.txt'), 'alpha edited\n'); assert.equal(text(s.base, 'c.txt'), 'gamma\n');
  assert.equal(s.base.find(f => f.path === 'run.sh').executable, true); assert.equal(s.files.find(f => f.path === 'run.sh').executable, false);
  assert.equal(s.baseCommit, head);
  for (const f of [...s.files, ...s.base]) assert.doesNotMatch(f.path, /ignored|node_modules|\.env/);
});
test('quota applies to the changed set and symlinks are refused', async t => {
  const r = await remote(t); const { root, head } = await clone(t, r);
  await fs.writeFile(path.join(root, 'big.bin'), Buffer.alloc(200));
  await assert.rejects(changedSet(root, head, { ...limits, fileBytes: 100 }));
  await fs.rm(path.join(root, 'big.bin')); await fs.symlink('/tmp', path.join(root, 'link'));
  await assert.rejects(changedSet(root, head, limits));
});
test('resume needs HEAD to equal the recorded base, and a saved set replays onto a fresh clone', async t => {
  const r = await remote(t); const { root, head } = await clone(t, r);
  await fs.writeFile(path.join(root, 'a.txt'), 'mine\n'); await fs.rm(path.join(root, 'c.txt')); await fs.writeFile(path.join(root, 'z.txt'), 'zed\n');
  const saved = await changedSet(root, head, limits);
  assert.equal(await headRevision(root), head); assert.notEqual(await headRevision(root), 'b'.repeat(40));
  assert.equal(await headRevision(path.join(r.dir, 'missing')), null);
  // The remote moves on; a fresh clone at the recorded base still starts from the old commit.
  await fs.writeFile(path.join(r.work, 'a.txt'), 'upstream\n'); sh(r.work, 'commit', '-qam', 'two'); sh(r.work, 'push', '-q', 'origin', 'HEAD:main');
  const again = path.join(r.dir, 'fresh'); await fs.mkdir(again);
  const pinned = await cloneSource({ repo: 'octo/hello', baseCommit: head, token: TOKEN }, again, { url: r.url });
  assert.equal(pinned, head); assert.equal(await fs.readFile(path.join(again, 'a.txt'), 'utf8'), 'alpha\n');
  await applyChanged(again, saved.files, saved.base, safePath, limits);
  assert.deepEqual(await changedSet(again, head, limits), saved);
  assert.equal((await fs.readFile(path.join(again, 'a.txt'), 'utf8')), 'mine\n'); await assert.rejects(fs.stat(path.join(again, 'c.txt')));
  const listed = (await treeFiles(again, limits)).map(f => f.path);
  assert.deepEqual(listed, ['.gitignore', 'a.txt', 'd.txt', 'run.sh', 'z.txt']);
});
