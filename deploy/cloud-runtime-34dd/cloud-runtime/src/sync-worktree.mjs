import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { shadowGit, EMPTY_TREE } from './sync-git.mjs';

export const FILE_CAP = 20 * 1024 * 1024; // same per-file cap as the Mac
const SAFE_ENV = /\.(example|sample|template|dist|defaults)$/i;
/** New files that look like secrets are never returned to the Mac (a file already in the last applied snapshot always is). */
export function secretLike(rel) {
  const b = rel.split('/').pop().toLowerCase();
  return b === '.env' || (b.startsWith('.env.') && !SAFE_ENV.test(b)) || /\.(pem|key|p12|pfx|keystore|jks)$/.test(b) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(b) || ['.npmrc', '.netrc', '.pypirc'].includes(b) || rel.includes('.aws/credentials');
}

/**
 * Lists what a snapshot of `workTree` contains: regular, non-ignored files up to the cap. The project's own .git is never
 * read (git runs against the shadow repo with the project folder as a bare work tree) and symlinks are skipped.
 */
export async function scanWorktree({ home, shadow, workTree, cap = FILE_CAP, known = null }) {
  const g = shadowGit({ home, shadow, workTree, indexFile: path.join(shadow, 'scan-unused-index') });
  const listed = (await g(['ls-files', '-z', '--others', '--exclude-standard'])).out.toString('utf8').split('\0').filter(Boolean);
  const files = []; let skipped = 0, base = null; // `known()` lazily returns the paths of the last applied snapshot
  for (const rel of listed) {
    if (rel.endsWith('/') || rel.split('/').some(c => c === '.git' || c === '..')) continue; // nested repository directory
    const st = await fs.lstat(path.join(workTree, rel)).catch(() => null);
    if (!st?.isFile()) continue;
    if (secretLike(rel) && !(await (base ??= known ? known() : Promise.resolve(new Set()))).has(rel)) { skipped++; continue; }
    if (st.size > cap) { skipped++; continue; }
    files.push({ rel, size: st.size, mtimeMs: st.mtimeMs, exec: (st.mode & 0o111) !== 0 });
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1)); return { files, skipped };
}
/** Cheap change fingerprint of a scan (path, size, mtime). */
export const fingerprint = files => { const h = crypto.createHash('sha1'); for (const f of files) h.update(`${f.rel}\0${f.size}\0${f.mtimeMs}\0${f.exec ? 1 : 0}\n`); return h.digest('hex'); };

/** Hashes the scanned files (byte exact, no filters) into the shadow repo and writes a tree through a throwaway index. `cache` skips unchanged files. */
export async function buildTree({ home, shadow, workTree, files, tmpDir, cache = new Map() }) {
  await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 }); const dir = await fs.mkdtemp(path.join(tmpDir, 'idx-'));
  try {
    const g = shadowGit({ home, shadow, workTree, indexFile: path.join(dir, 'index') }); const gw = shadowGit({ home, shadow, workTree });
    const fresh = Date.now() - 3000; const todo = []; const shas = new Map();
    for (const f of files) { const c = cache.get(f.rel); if (c && c.size === f.size && c.mtimeMs === f.mtimeMs) shas.set(f.rel, c.sha); else todo.push(f); }
    for (let i = 0; i < todo.length;) {
      const batch = []; let bytes = 0; while (i < todo.length && batch.length < 256 && bytes < 60000) { batch.push(todo[i]); bytes += todo[i].rel.length + 1; i++; }
      const out = (await gw(['hash-object', '-w', '--no-filters', '--', ...batch.map(f => f.rel)])).out.toString().split('\n').filter(Boolean);
      if (out.length !== batch.length) throw Error('hash-object count mismatch');
      batch.forEach((f, n) => { shas.set(f.rel, out[n]); if (f.mtimeMs < fresh) cache.set(f.rel, { size: f.size, mtimeMs: f.mtimeMs, sha: out[n] }); });
    }
    const live = new Set(files.map(f => f.rel)); for (const k of cache.keys()) if (!live.has(k)) cache.delete(k);
    const lines = files.map(f => `${f.exec ? '100755' : '100644'} ${shas.get(f.rel)}\t${f.rel}\0`).join('');
    if (!lines) return EMPTY_TREE;
    await g(['update-index', '-z', '--add', '--index-info'], { input: lines });
    return (await g(['write-tree'])).out.toString().trim();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Tree of a project's current files (as a snapshot would record them), plus what was skipped. `ctx` carries paths, state and a per-project hash cache. */
export async function worktreeTree(ctx, name) {
  const workTree = path.join(ctx.paths.projects, name), shadow = path.join(ctx.paths.shadow, `${name}.git`), home = ctx.paths.home;
  const st = await fs.lstat(workTree).catch(() => null);
  if (!st) return { tree: EMPTY_TREE, files: [], skipped: 0, missing: true };
  if (!st.isDirectory()) throw Error('project folder is not a plain directory');
  const saved = await ctx.state.get(name); const g = shadowGit({ home, shadow });
  // Secret-looking files are only returned when the applied snapshot (or the last return) already carried them.
  const known = async () => { const names = new Set(); for (const ref of [saved.snapHead, saved.lastTree].filter(Boolean)) for (const n of (await g(['ls-tree', '-r', '-z', '--name-only', ref], { okCodes: [0, 128] })).out.toString('utf8').split('\0')) if (n) names.add(n); return names; };
  const scan = await scanWorktree({ home, shadow, workTree, known });
  const cache = ctx.caches.get(name) ?? ctx.caches.set(name, new Map()).get(name);
  return { tree: await buildTree({ home, shadow, workTree, files: scan.files, tmpDir: ctx.paths.tmp, cache }), files: scan.files, skipped: scan.skipped };
}
