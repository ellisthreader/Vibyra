import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Hardened git runner for the sync worker. It runs as uid 1001 (or as the test user): never hooks, never repo/user/system
// config, never filters, never a prompt. The shadow repo is ours; a project's own .git is never read or written.
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const nameOk = n => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(n ?? '') && !n.endsWith('.lock');
const FLAGS = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.excludesFile=/dev/null', '-c', 'core.attributesFile=/dev/null', '-c', 'core.autocrlf=false',
  '-c', 'core.safecrlf=false', '-c', 'core.quotePath=false', '-c', 'fetch.fsckObjects=true', '-c', 'transfer.fsckObjects=true', '-c', 'gc.autoDetach=false', '-c', 'protocol.ext.allow=never',
  '-c', 'user.name=Vibyra Cloud', '-c', 'user.email=cloud@vibyra.invalid', '-c', 'commit.gpgsign=false'];
export const gitEnv = (home, extra = {}) => ({ PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_COUNT: '0', ...extra });

/** Runs git; resolves {code, out(Buffer), err(string)}; rejects (with stderr) on a non-zero exit unless `okCodes` allows it. */
export function git(args, { env, cwd = '/', input = null, timeoutMs = 600000, okCodes = [0], maxOut = 256 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
    const child = spawn('git', [...FLAGS, ...args], { cwd, env: clean, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], detached: true });
    const out = [], err = []; let size = 0, done = false;
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } };
    const timer = setTimeout(kill, timeoutMs);
    child.stdout.on('data', c => { size += c.length; if (size > maxOut) kill(); else out.push(c); }); child.stderr.on('data', c => { if (err.length < 40) err.push(c); });
    child.on('error', e => { clearTimeout(timer); if (!done) { done = true; reject(e); } });
    child.on('close', code => { clearTimeout(timer); if (done) return; done = true; const r = { code, out: Buffer.concat(out), err: Buffer.concat(err).toString('utf8').slice(0, 400) };
      okCodes.includes(code) ? resolve(r) : reject(Object.assign(Error(`git ${args[0]} failed: ${r.err.trim() || code}`), r)); });
    if (input != null) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}
/** A git bound to one project's shadow repo (and optionally its working tree and a throwaway index). */
export function shadowGit({ home, shadow, workTree = null, indexFile = null }) {
  const env = gitEnv(home, { GIT_DIR: shadow, ...(workTree ? { GIT_WORK_TREE: workTree } : {}), ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}) });
  // cwd is never the bare repo itself: inside it `refs/vibyra/cloud` is also a FILE path, so `git bundle create ... refs/vibyra/cloud` is ambiguous.
  const run = (args, o = {}) => git(args, { env, cwd: workTree ?? '/', ...o }); run.env = env; return run;
}
/** Creates the bare shadow repo when missing. Config is ours only; nothing from a project is ever read into it. */
export async function ensureShadow(home, shadow) {
  if (await fs.stat(path.join(shadow, 'HEAD')).then(() => true, () => false)) return;
  await fs.mkdir(path.dirname(shadow), { recursive: true, mode: 0o700 });
  await git(['init', '--bare', '-q', '--', shadow], { env: gitEnv(home) });
  const g = shadowGit({ home, shadow });
  for (const [k, v] of [['core.hooksPath', '/dev/null'], ['core.bare', 'false'], ['core.logAllRefUpdates', 'false']]) await g(['config', k, v]);
}
export const revParse = async (g, ref) => (await g(['rev-parse', '--verify', '-q', `${ref}^{commit}`], { okCodes: [0, 1] })).out.toString().trim() || null;
export const treeOf = async (g, commit) => (await g(['rev-parse', '--verify', `${commit}^{tree}`])).out.toString().trim();
export const hasObject = async (g, sha) => (await g(['cat-file', '-e', sha], { okCodes: [0, 1] })).code === 0;

/** `git diff-tree -r` between two trees: [{status, mode, sha, path}] where mode/sha describe the new side. */
export async function diffTrees(g, a, b) {
  const parts = (await g(['diff-tree', '-r', '-z', '--raw', '--no-renames', '--no-abbrev', a, b])).out.toString('utf8').split('\0'); const rows = [];
  for (let i = 0; i + 1 < parts.length; i += 2) { const m = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) (\w)/.exec(parts[i]); if (m) rows.push({ oldMode: m[1], mode: m[2], sha: m[4], status: m[5], path: parts[i + 1] }); }
  return rows;
}
/** `git cat-file --batch` as an async reader: read(sha) -> Buffer. */
export function batchReader(g, { maxBlob = 64 * 1024 * 1024 } = {}) {
  const child = spawn('git', [...FLAGS, 'cat-file', '--batch'], { env: Object.fromEntries(Object.entries(g.env).filter(([, v]) => v !== undefined)), cwd: '/', stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = Buffer.alloc(0), wake = null, ended = false;
  child.stdout.on('data', c => { buf = Buffer.concat([buf, c]); wake?.(); }); child.on('close', () => { ended = true; wake?.(); }); child.stdin.on('error', () => {});
  const need = async ok => { while (!ok()) { if (ended) throw Error('cat-file ended'); await new Promise(r => { wake = r; }); } wake = null; };
  return {
    async read(sha) {
      child.stdin.write(`${sha}\n`); await need(() => buf.indexOf(10) >= 0);
      const nl = buf.indexOf(10); const head = buf.toString('latin1', 0, nl).split(' ');
      if (head[1] !== 'blob') throw Error(`object ${sha} is not a blob`);
      const size = Number(head[2]); if (!(size >= 0 && size <= maxBlob)) throw Error('blob too large');
      await need(() => buf.length >= nl + 1 + size + 1);
      const data = Buffer.from(buf.subarray(nl + 1, nl + 1 + size)); buf = buf.subarray(nl + 2 + size); return data;
    },
    close() { child.stdin.end(); child.kill('SIGKILL'); },
  };
}
