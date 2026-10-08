import fs from 'node:fs/promises';
import fsc from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { shadowGit, ensureShadow, revParse, hasObject, nameOk } from './sync-git.mjs';
import { worktreeTree } from './sync-worktree.mjs';
import { sealStream } from './sync-crypto.mjs';
import { collectTranscripts } from './sync-transcripts.mjs';

/** Seals `plainFile` to one Mac key into a temp file; returns {file, sha256} (the upload parameter is the hash of the ciphertext). */
export async function sealFile(plainFile, publicKey, outFile) {
  const hash = crypto.createHash('sha256');
  const tap = async function* (src) { for await (const c of src) { hash.update(c); yield c; } };
  await pipeline(fsc.createReadStream(plainFile), sealStream(publicKey), tap, fsc.createWriteStream(outFile, { mode: 0o600 }));
  return { file: outFile, sha256: hash.digest('hex') };
}
/** Seals once per Mac key and uploads each; every file is removed afterwards. */
async function sendToMacs(ctx, name, plainFile, params, macs, deadline) {
  for (const mac of macs) {
    if ((ctx.now ?? Date.now)() > deadline) throw Error('snapshot budget exhausted');
    const out = path.join(ctx.paths.tmp, `up-${process.pid}-${crypto.randomBytes(4).toString('hex')}.sealed`);
    try { const sealed = await sealFile(plainFile, mac.publicKey, out); await ctx.client.upload(name, { ...params, sha256: sealed.sha256, mac: mac.id, file: sealed.file }); }
    finally { await fs.rm(out, { force: true }); }
  }
}
const serverState = async (ctx, name) => (await ctx.client.state()).projects?.find(p => p.name === name) ?? {};

/**
 * Return path (code): one full-tree snapshot commit of the project against the shadow chain (throwaway index, uid 1001), an
 * incremental `git bundle` of refs/vibyra/cloud, sealed once per registered Mac. Only projects this VM applied (a shadow repo exists).
 */
export async function snapshotProject(ctx, name, { deadline = Infinity, force = false } = {}) {
  if (!nameOk(name)) return { sent: false, reason: 'bad_name' };
  const shadow = path.join(ctx.paths.shadow, `${name}.git`); if (!(await fs.lstat(shadow).catch(() => null))) return { sent: false, reason: 'no_shadow' };
  await ensureShadow(ctx.paths.home, shadow); const g = shadowGit({ home: ctx.paths.home, shadow });
  const st = await ctx.state.get(name); const current = await worktreeTree(ctx, name);
  if (current.missing) return { sent: false, reason: 'missing' };
  const last = st.lastTree ?? (st.snapHead ? (await g(['rev-parse', `${st.snapHead}^{tree}`])).out.toString().trim() : null);
  if (!force && current.tree === last) return { sent: false, reason: 'unchanged' };
  const macs = (await ctx.client.macs()).macs ?? []; if (!macs.length) return { sent: false, reason: 'no_macs' };
  const remote = await serverState(ctx, name); const downSeq = Number(remote.downSeq ?? 0);
  const prev = st.cloudHead && st.cloudSeq === downSeq && await hasObject(g, st.cloudHead) ? st.cloudHead : null;
  const message = `Vibyra cloud snapshot\n\nVibyra-Base: ${st.snapHead ?? 'none'}\n`;
  const commit = (await g(['commit-tree', current.tree, ...(prev ? ['-p', prev] : []), '-m', message])).out.toString().trim();
  const before = await revParse(g, 'refs/vibyra/cloud'); const bundle = path.join(ctx.paths.tmp, `down-${process.pid}-${Date.now()}.bundle`);
  await fs.mkdir(ctx.paths.tmp, { recursive: true, mode: 0o700 });
  try {
    await g(['update-ref', 'refs/vibyra/cloud', commit]);
    await g(['bundle', 'create', '-q', bundle, 'refs/vibyra/cloud', ...(prev ? [`^${prev}`] : [])]);
    await sendToMacs(ctx, name, bundle, { kind: 'code', seq: downSeq + 1, baseSeq: prev ? downSeq : 0, head: commit }, macs, deadline);
  } catch (e) {
    if (before) await g(['update-ref', 'refs/vibyra/cloud', before]).catch(() => {}); else await g(['update-ref', '-d', 'refs/vibyra/cloud']).catch(() => {});
    throw e;
  } finally { await fs.rm(bundle, { force: true }); }
  await ctx.state.set(name, { cloudHead: commit, cloudSeq: downSeq + 1, cloudTree: current.tree, lastTree: current.tree, lastKind: 'cloud' });
  return { sent: true, head: commit, seq: downSeq + 1 };
}

/** Return path (transcripts): sessions created or changed on the VM since the last send, cwd mapped to the Mac root when the Mac told us one. */
export async function returnTranscripts(ctx, name, { deadline = Infinity } = {}) {
  if (!nameOk(name)) return { sent: false };
  const st = await ctx.state.get(name); const found = await collectTranscripts({ home: ctx.paths.home, projectsDir: ctx.paths.projects, project: name, tmp: ctx.paths.tmp, sent: st.sentTranscripts ?? {}, macCwd: st.macCwd ?? null });
  if (!found) return { sent: false, reason: 'unchanged' };
  try {
    const macs = (await ctx.client.macs()).macs ?? []; if (!macs.length) return { sent: false, reason: 'no_macs' };
    const seq = Number((await serverState(ctx, name)).transcriptsDownSeq ?? 0) + 1;
    await sendToMacs(ctx, name, found.tarFile, { kind: 'transcripts', seq, baseSeq: 0, head: '-' }, macs, deadline);
    await ctx.state.set(name, { sentTranscripts: { ...(st.sentTranscripts ?? {}), ...found.markSent() } });
    return { sent: true, seq };
  } finally { await fs.rm(found.tarFile, { force: true }); }
}
