import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { components, sha, validateNames } from './files.mjs';

const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const refPattern = /^(?!-)[A-Za-z0-9._/-]+$/;
const shaPattern = /^([a-f0-9]{40}|[a-f0-9]{64})$/;

// A fixed, credential-free environment. Git never reads system or global config, prompts, or runs hooks.
function baseEnv() {
  const home = existsSync('/home/project') ? '/home/project' : os.tmpdir();
  const tmp = existsSync('/tmp/project') ? '/tmp/project' : os.tmpdir();
  return { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, TMPDIR: tmp, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' };
}
const safety = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'credential.helper=', '--literal-pathspecs'];
// Privilege is dropped for every git call, so root never parses repository-controlled data.
const identity = opts => (process.getuid?.() === 0 ? { uid: opts.uid ?? 1001, gid: opts.gid ?? 1001 } : {});

export function git(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', [...safety, ...args], { cwd: opts.cwd, env: opts.env ?? baseEnv(), encoding: 'buffer', maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 30000, killSignal: 'SIGKILL', ...identity(opts) }, (error, stdout, stderr) => {
      if (error) { const e = Error(error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'Git output exceeds the allowed size' : `git ${args[0]} failed`); e.code = error.code; e.stderr = stderr?.toString('utf8').slice(0, 500); return reject(e); }
      resolve(stdout);
    });
  });
}

/** Environment for the clone child: the token exists only here, as a scoped extra header, never in argv. */
export function cloneEnv(token, url) {
  const env = baseEnv();
  if (token) {
    const parsed = new URL(url);
    const scope = parsed.protocol === 'https:' ? `http.${parsed.origin}/.extraheader` : 'http.extraheader';
    env.GIT_CONFIG_COUNT = '1'; env.GIT_CONFIG_KEY_0 = scope;
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  return env;
}
export function cloneUrl(source) {
  if (!repoPattern.test(source.repo) || source.repo.split('/').some(p => p === '.' || p === '..')) throw Error('Invalid repository');
  return `https://github.com/${source.repo}.git`;
}
/** Argument lists for each git step. Nothing secret, nothing user-controlled unescaped. */
export function cloneSteps(source, url) {
  if (source.ref != null && !refPattern.test(source.ref)) throw Error('Invalid ref');
  if (source.baseCommit) {
    if (!shaPattern.test(source.baseCommit)) throw Error('Invalid base commit');
    return [['init', '-q'], ['remote', 'add', 'origin', url], ['fetch', '-q', '--depth', '1', '--no-tags', 'origin', source.baseCommit], ['checkout', '-q', '--detach', 'FETCH_HEAD']];
  }
  return [['clone', '-q', '--depth', '1', '--no-tags', ...(source.ref ? ['--branch', source.ref] : []), '--', url, '.']];
}
async function directoryBytes(dir) {
  let total = 0;
  for (const item of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) total += await directoryBytes(p); else total += (await fs.lstat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}
function run(args, cwd, env, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...safety, ...args], { cwd, env, stdio: 'ignore', detached: true, ...identity(opts) });
    let failure = null;
    const stop = reason => { failure ??= reason; try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => stop('Clone timed out'), opts.timeoutMs ?? 300000);
    const size = setInterval(async () => { if (await directoryBytes(cwd) > (opts.maxBytes ?? 2 * 1024 ** 3)) stop('Repository exceeds the size limit'); }, 2000);
    child.on('error', e => { clearTimeout(timer); clearInterval(size); reject(e); });
    child.on('close', code => { clearTimeout(timer); clearInterval(size); failure ? reject(Error(failure)) : code === 0 ? resolve() : reject(Error(`git ${args[0]} failed`)); });
  });
}
/** Clones into the (empty, project-owned) root and returns the base commit. */
export async function cloneSource(source, root, opts = {}) {
  const url = opts.url ?? cloneUrl(source); const env = cloneEnv(source.token, url);
  for (const step of cloneSteps(source, url)) await run(step, root, env, opts);
  const head = (await git(['rev-parse', 'HEAD'], { cwd: root, ...opts })).toString().trim();
  if (!shaPattern.test(head)) throw Error('Clone did not produce a commit');
  return head;
}
export async function headRevision(root, opts = {}) {
  try {
    const head = (await git(['rev-parse', 'HEAD'], { cwd: root, ...opts })).toString().trim();
    const top = (await git(['rev-parse', '--show-toplevel'], { cwd: root, ...opts })).toString().trim();
    return shaPattern.test(head) && path.resolve(top) === path.resolve(await fs.realpath(root)) ? head : null;
  } catch { return null; }
}

async function readRegular(root, relative, limits) {
  const handle = await fs.open(path.join(root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > limits.fileBytes) throw Error('File quota exceeded');
    return { bytes: await handle.readFile(), executable: !!(stat.mode & 0o111) }; } finally { await handle.close(); }
}
const entry = (p, bytes, executable) => ({ path: p, content: bytes.toString('base64'), sha256: sha(bytes), executable });
function parseStatus(buffer) {
  const tokens = buffer.toString('utf8').split('\0'); const paths = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i]; if (item.length < 4) continue;
    paths.add(item.slice(3));
    if (item[0] === 'R' || item[0] === 'C' || item[1] === 'R' || item[1] === 'C') { const from = tokens[++i]; if (from && (item[0] === 'R' || item[1] === 'R')) paths.add(from); }
  }
  return [...paths];
}
/** Changed/added files (current contents) plus base-commit contents of every changed path. A base path without a current file is a deletion. */
export async function changedSet(root, baseCommit, limits, opts = {}) {
  if (!shaPattern.test(baseCommit ?? '')) throw Error('Invalid base commit');
  const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, timeoutMs: 20000, ...opts });
  const candidates = parseStatus(status).filter(p => { try { components(p); return true; } catch { return false; } }).sort();
  const files = []; const gone = []; let bytes = 0;
  for (const p of candidates) {
    const stat = await fs.lstat(path.join(root, p)).catch(e => { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; });
    if (!stat) { gone.push(p); continue; }
    if (stat.isSymbolicLink()) throw Error('Remove symlinks before saving this cloud project');
    if (stat.isDirectory()) continue;
    if (!stat.isFile()) throw Error('Special files are not supported');
    const { bytes: b, executable } = await readRegular(root, p, limits); bytes += b.length;
    if (files.length >= limits.files || bytes > limits.projectBytes) throw Error('Project quota exceeded');
    files.push(entry(p, b, executable));
  }
  const modes = new Map();
  const all = [...new Set([...files.map(f => f.path), ...gone])];
  for (let i = 0; i < all.length; i += 200) {
    const out = (await git(['ls-tree', '-r', '-z', baseCommit, '--', ...all.slice(i, i + 200)], { cwd: root, ...opts })).toString('utf8');
    for (const line of out.split('\0')) { const t = line.indexOf('\t'); if (t > 0) { const [mode, type] = line.slice(0, t).split(' '); if (type === 'blob') modes.set(line.slice(t + 1), mode); } }
  }
  const base = []; let baseBytes = 0;
  for (const p of all) {
    const mode = modes.get(p); if (!mode) continue;
    const b = await git(['show', `${baseCommit}:${p}`], { cwd: root, maxBuffer: limits.fileBytes + 1, ...opts });
    baseBytes += b.length; if (base.length >= limits.files || baseBytes > limits.projectBytes) throw Error('Project quota exceeded');
    base.push(entry(p, b, mode === '100755'));
  }
  validateNames(files);
  const order = (a, b) => a.path.localeCompare(b.path, 'en');
  return { files: files.sort(order), base: base.sort(order), baseCommit };
}
/** Re-applies a saved changed set on top of a fresh clone. */
export async function applyChanged(root, files, base, safePath, limits) {
  if (!Array.isArray(files) || files.length > limits.files) throw Error('File quota exceeded');
  validateNames(files); const keep = new Set(files.map(f => f.path)); let total = 0;
  for (const f of files) {
    const b = Buffer.from(f.content, 'base64'); total += b.length;
    if (b.toString('base64') !== f.content || sha(b) !== f.sha256 || b.length > limits.fileBytes || total > limits.projectBytes) throw Error('Invalid artifact or quota');
    const target = await safePath(root, f.path, true);
    await fs.rm(target, { force: true }); await fs.writeFile(target, b, { flag: 'wx', mode: f.executable ? 0o755 : 0o644 });
  }
  for (const f of base ?? []) if (!keep.has(f.path)) await fs.rm(await safePath(root, f.path), { force: true }).catch(() => {});
}
/** Tracked plus untracked-but-not-ignored files, for read-only tools; oversized or special files are skipped. */
export async function treeFiles(root, limits, opts = {}) {
  const listed = (await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, timeoutMs: 20000, ...opts })).toString('utf8').split('\0').filter(Boolean);
  const out = []; let bytes = 0;
  for (const p of [...new Set(listed)].sort()) {
    try { components(p); const { bytes: b, executable } = await readRegular(root, p, limits); bytes += b.length;
      if (out.length >= 20000 || bytes > 64 * 1024 * 1024) break; out.push(entry(p, b, executable)); } catch { /* skip */ }
  }
  return out;
}
