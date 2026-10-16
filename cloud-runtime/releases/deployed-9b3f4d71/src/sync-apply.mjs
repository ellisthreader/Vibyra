import fs from 'node:fs/promises';
import fsc from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { shadowGit, ensureShadow, revParse, treeOf, diffTrees, batchReader, nameOk } from './sync-git.mjs';
import { worktreeTree } from './sync-worktree.mjs';
import { openStream } from './sync-crypto.mjs';
import { applyTranscripts } from './sync-transcripts.mjs';
import { trustProject } from './sync-trust.mjs';
import { REASONS, failure, codeOf } from './sync-codes.mjs';

const REGULAR = new Set(['100644', '100755']);
const safeRel = rel => rel && !path.isAbsolute(rel) && !rel.includes('\0') && rel.split('/').every(c => c && c !== '.' && c !== '..' && c !== '.git');
const err = (code, message) => Object.assign(Error(message ?? code), { syncCode: code });

/** A download is retried this many times (spaced by drains) before the Mac is asked to send the whole project again. */
export const DOWNLOAD_TRIES = 3;
/** Free space an apply needs beyond 3× the sealed size (sealed + plain + unpacked objects and files). */
const SPARE_BYTES = 256 * 1024 * 1024;

/** Whether the volume holding `dir` lacks room for a blob of `bytes`. Unknown (no statfs) counts as room. */
export async function lowSpace(dir, bytes) {
  const st = await fs.statfs(dir).catch(() => null); if (!st || !bytes) return false;
  return st.bavail * st.bsize < bytes * 3 + SPARE_BYTES;
}

/** Downloads one sealed blob, checks its sha256 (server-side integrity), opens it with the VM key. Returns the plaintext file. */
export async function fetchPlain(ctx, item) {
  await fs.mkdir(ctx.paths.tmp, { recursive: true, mode: 0o700 });
  const id = String(item.id).replace(/[^A-Za-z0-9_-]/g, '_'); const sealed = path.join(ctx.paths.tmp, `${id}.sealed`), plain = path.join(ctx.paths.tmp, `${id}.plain`);
  try {
    // A network failure is worth another try (`transient`); stored bytes that do not match what the Mac sent are not.
    const got = await ctx.client.download(item.id, sealed).catch(e => { throw e.code === 'ENOSPC' ? e : Object.assign(err('download_failed', e.message), { transient: true }); });
    if (item.sha256 && got.sha256 !== String(item.sha256).toLowerCase()) throw err('download_failed', 'sealed blob hash mismatch');
    try { await pipeline(fsc.createReadStream(sealed), openStream(ctx.key.secretHex), fsc.createWriteStream(plain, { mode: 0o600 })); }
    catch (e) {
      if (e.code === 'ENOSPC') throw e;
      // The bytes are exactly what the Mac uploaded (hash checked), so a first chunk that does not open was sealed for another key.
      throw err(e.code === 'VSYNC_REJECT' && e.chunk === 0 ? 'key_mismatch' : 'verify_failed', e.code === 'VSYNC_REJECT' ? `rejected: ${e.message}` : 'decrypt failed');
    }
    return plain;
  } catch (e) { await fs.rm(plain, { force: true }); throw e; } finally { await fs.rm(sealed, { force: true }); }
}
/** Creates every parent of `rel` under `root` as a real directory; a symlink or file in the way is replaced (the entry only, never followed). */
async function ensureParents(root, rel) {
  let cur = root;
  for (const part of path.dirname(rel).split('/').filter(c => c !== '.')) {
    cur = path.join(cur, part); const st = await fs.lstat(cur).catch(() => null);
    if (st?.isDirectory()) continue; if (st) await fs.rm(cur, { force: true });
    await fs.mkdir(cur, { mode: 0o755 });
  }
}
async function pruneEmpty(root, rel) { let dir = path.dirname(rel); while (dir && dir !== '.') { try { await fs.rmdir(path.join(root, dir)); } catch { return; } dir = path.dirname(dir); } }

/** Writes the difference between two trees into the working folder: stage in .<name>.syncing, then rename into place. Symlinks/gitlinks are never created. */
async function applyDiff(ctx, name, from, to) {
  const root = path.join(ctx.paths.projects, name), stage = path.join(ctx.paths.projects, `.${name}.syncing`);
  const g = shadowGit({ home: ctx.paths.home, shadow: path.join(ctx.paths.shadow, `${name}.git`) });
  const rows = (await diffTrees(g, from, to)).filter(r => safeRel(r.path)); const writes = [], deletes = [];
  for (const r of rows) (REGULAR.has(r.mode) ? writes : (r.status === 'D' || REGULAR.has(r.oldMode) ? deletes : [])).push(r);
  await fs.rm(stage, { recursive: true, force: true }); await fs.mkdir(stage, { mode: 0o700 }); await fs.mkdir(root, { recursive: true, mode: 0o755 });
  const reader = batchReader(g);
  try { for (const [i, r] of writes.entries()) await fs.writeFile(path.join(stage, `s${i}`), await reader.read(r.sha), { mode: 0o600 }); } finally { reader.close(); }
  for (const [i, r] of writes.entries()) {
    const dest = path.join(root, r.path); await ensureParents(root, r.path);
    const cur = await fs.lstat(dest).catch(() => null); if (cur?.isDirectory()) await fs.rm(dest, { recursive: true, force: true });
    await fs.chmod(path.join(stage, `s${i}`), r.mode === '100755' ? 0o755 : 0o644); await fs.rename(path.join(stage, `s${i}`), dest);
  }
  for (const r of deletes) { const dest = path.join(root, r.path); if ((await fs.lstat(dest).catch(() => null))?.isFile()) { await fs.unlink(dest); await pruneEmpty(root, r.path); } }
  await fs.rm(stage, { recursive: true, force: true }); return { written: writes.length, deleted: deletes.length };
}

/** Applies one opened `kind=code` bundle. Returns the body for POST blobs/{id}/applied. */
export async function applyCode(ctx, item, bundle) {
  const name = item.project; if (!nameOk(name)) throw err('bad_name');
  const shadow = path.join(ctx.paths.shadow, `${name}.git`); await ensureShadow(ctx.paths.home, shadow); const g = shadowGit({ home: ctx.paths.home, shadow });
  const verify = await g(['bundle', 'verify', bundle], { okCodes: [0, 1, 128] });
  if (verify.code !== 0) return /prerequisite|lacks/i.test(verify.err) ? failure('needs_full', { needFull: true }) : failure('verify_failed');
  const heads = (await g(['bundle', 'list-heads', bundle])).out.toString().trim().split('\n').filter(Boolean).map(l => l.split(' '));
  if (heads.length !== 1 || heads[0][1] !== 'refs/vibyra/snap' || (item.head && item.head !== '-' && heads[0][0] !== item.head)) return failure('verify_failed');
  await g(['fetch', '--quiet', '--no-tags', '--update-head-ok', '--', bundle, '+refs/vibyra/snap:refs/vibyra/incoming']);
  const head = await revParse(g, 'refs/vibyra/incoming'); if (head !== heads[0][0]) return failure('verify_failed');
  const target = await treeOf(g, head); const st = await ctx.state.get(name);
  const current = await worktreeTree(ctx, name); const snapTree = st.snapTree ?? (st.snapHead ? await treeOf(g, st.snapHead).catch(() => null) : null);
  const safe = !!st.applying || current.tree === snapTree || current.tree === st.cloudTree || (!snapTree && !st.cloudTree && current.files.length === 0);
  if (!safe) { await ctx.takeSnapshot?.(name).catch(() => {}); return { ok: true, head, state: 'diverged', code: 'diverged', message: REASONS.diverged }; }
  await ctx.state.set(name, { applying: head });
  await applyDiff(ctx, name, current.tree, target);
  await g(['update-ref', 'refs/vibyra/snap', head]); await ctx.state.set(name, { snapHead: head });
  // What the folder really holds now (symlinks, gitlinks and over-cap files in the bundle are not materialised) is the baseline for divergence checks.
  const after = (await worktreeTree(ctx, name)).tree;
  await ctx.state.set(name, { applying: null, snapHead: head, snapTree: after, lastTree: after, lastKind: 'snap' });
  return { ok: true, head, state: 'synced' };
}

/**
 * Handles one pending item end to end. Never throws: failures become a report body with a fixed `code` (sync-codes.mjs).
 * `{retry: true}` = a download that may work next time: nothing is reported for the item, it stays pending (`ctx.tries`).
 */
export async function applyItem(ctx, item) {
  let plain = null;
  try {
    if (!nameOk(item.project) || !['code', 'transcripts'].includes(item.kind)) return failure('apply_failed');
    if (ctx.resync?.has(item.project) && item.baseSeq !== 0) return failure('needs_full', { needFull: true });
    // A report that never reached the backend is re-delivered: answer from the record instead of replaying (an old snapshot must never overwrite a newer one).
    const prior = (await ctx.state.get(item.project)).applied?.[item.kind]; if (prior && item.seq <= prior.seq) return prior.body;
    if (await lowSpace(ctx.paths.tmp, item.bytes)) return failure('disk_full');
    plain = await fetchPlain(ctx, item);
    if (item.kind === 'transcripts') {
      const r = await applyTranscripts({ home: ctx.paths.home, projectsDir: ctx.paths.projects, project: item.project, tmp: ctx.paths.tmp, tarFile: plain });
      const st = await ctx.state.get(item.project);
      const body = { ok: true };
      await ctx.state.set(item.project, { macCwd: r.macCwd ?? st.macCwd ?? null, sentTranscripts: { ...(st.sentTranscripts ?? {}), ...r.placed }, applied: { ...(st.applied ?? {}), transcripts: { seq: item.seq, body } } });
      return body;
    }
    const body = await applyCode(ctx, item, plain);
    if (body.ok) { const st = await ctx.state.get(item.project); await ctx.state.set(item.project, { applied: { ...(st.applied ?? {}), code: { seq: item.seq, body } } }); }
    if (body.ok && body.state !== 'diverged') await trustProject(ctx.paths.home, ctx.paths.projects, item.project); // no first-run trust questions for the owner's own folder
    return body;
  } catch (e) {
    if (e.transient) {
      const n = (ctx.tries?.get(item.id) ?? 0) + 1; ctx.tries?.set(item.id, n);
      if (n < DOWNLOAD_TRIES) return { retry: true, code: 'download_failed', message: REASONS.download_failed };
    }
    const code = codeOf(e);
    // A lost key or a bad stored copy is fixed by a fresh full upload from the Mac, never by the person.
    return failure(code, ['key_mismatch', 'download_failed'].includes(code) ? { needFull: true } : {});
  } finally { if (plain) await fs.rm(plain, { force: true }); }
}

/** A project the Mac removed from sync: drop the folder only when we manage it (a shadow repo exists), never a folder we did not create. */
export async function removeProject(ctx, name) {
  if (!nameOk(name)) return false; const shadow = path.join(ctx.paths.shadow, `${name}.git`);
  if (!(await fs.lstat(shadow).catch(() => null))) return false;
  const root = path.join(ctx.paths.projects, name);
  if ((await fs.lstat(root).catch(() => null))?.isSymbolicLink()) await fs.unlink(root); else await fs.rm(root, { recursive: true, force: true });
  await fs.rm(path.join(ctx.paths.projects, `.${name}.syncing`), { recursive: true, force: true });
  await fs.rm(shadow, { recursive: true, force: true }); await ctx.state.remove(name); ctx.caches.delete(name); return true;
}
