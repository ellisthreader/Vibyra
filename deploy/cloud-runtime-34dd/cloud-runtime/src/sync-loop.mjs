import fs from 'node:fs/promises';
import path from 'node:path';
import { stateStore } from './sync-state.mjs';
import { ensureKey, publishKey } from './sync-key.mjs';
import { applyItem, removeProject } from './sync-apply.mjs';
import { REASONS, problemOf } from './sync-codes.mjs';
import { applyLogin, forgetCopiedLogin } from './sync-login.mjs';
import { snapshotProject, returnTranscripts } from './sync-snapshot.mjs';
import { scanWorktree, fingerprint } from './sync-worktree.mjs';
import { nameOk } from './sync-git.mjs';

export const QUIET_MS = 60000, PERIODIC_MS = 300000, DRAIN_MS = 5000, WATCH_MS = 10000, FINAL_BUDGET_MS = 8000;
/** How long a graceful stop waits for the item being applied (it starts no new one). Must fit the backend's stop timeout
 *  (45 s) with the Host's grace and the final return pass: heartbeat ≤ 5 + 15 + 10 + 8 + 3 s. */
export const APPLY_GRACE_MS = 15000;
/** A download that failed on the network is tried again after this long (per try). */
export const RETRY_MS = 30000;
const sleepReal = ms => new Promise(r => setTimeout(r, ms));

/**
 * The sync orchestration. It runs inside the uid-1001 worker (sync-worker.mjs) so every file and git operation is the project
 * user's own; tests run it in-process with a fake client. `client` is a SyncClient, `paths` = {home, projects, shadow, tmp, syncDir}.
 */
export function createSyncEngine({ client, paths, now = Date.now, sleep = sleepReal, quietMs = QUIET_MS, periodicMs = PERIODIC_MS, watchMs = WATCH_MS, drainMs = DRAIN_MS, log = () => {} }) {
  const ctx = { client, paths, now, state: stateStore(paths.syncDir), caches: new Map(), key: null, resync: new Set(), takeSnapshot: null, tries: new Map(), retryAt: new Map() };
  let chain = Promise.resolve(); const serial = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
  ctx.takeSnapshot = name => snapshotProject(ctx, name, { force: true });
  const watch = new Map(); let lastWatch = 0, keyPublished = false, stopping = false;
  // What the backend last heard: `status` carries {applying, keyOk, lastError} and is sent at the edges of real work, or when it changed.
  let lastError = null, reported = null;
  async function report(applying = false, force = false) {
    const body = { applying, keyOk: keyPublished, lastError }; const text = JSON.stringify(body);
    if (!force && text === reported) return; await client.status(body).then(() => { reported = text; }, e => log('status failed', e.message));
  }
  async function publish() {
    await publishKey(client, ctx.key).then(() => { keyPublished = true; }, e => { keyPublished = false; log('key publish failed', e.message); });
  }
  /** Removals this VM still has something to do for (a shadow repo exists); the backend may list a name long after. */
  const managed = async names => { const out = []; for (const n of names) if (nameOk(n) && await fs.lstat(path.join(paths.shadow, `${n}.git`)).catch(() => null)) out.push(n); return out; };
  const due = item => (ctx.retryAt.get(item.id) ?? 0) <= now();

  async function cleanup() {
    // Empty the scratch folder rather than remove it: root prepared it directly under root-owned /data, so this uid-1001
    // worker may delete its contents but not the folder itself (EACCES on rmdir).
    await fs.mkdir(paths.tmp, { recursive: true, mode: 0o700 });
    for (const e of await fs.readdir(paths.tmp)) await fs.rm(path.join(paths.tmp, e), { recursive: true, force: true });
    for (const e of await fs.readdir(paths.shadow).catch(() => [])) for (const d of ['', 'refs/vibyra']) for (const f of await fs.readdir(path.join(paths.shadow, e, d)).catch(() => [])) if (f.endsWith('.lock')) await fs.rm(path.join(paths.shadow, e, d, f), { force: true });
    for (const e of await fs.readdir(paths.projects).catch(() => [])) if (/^\..+\.syncing$/.test(e) && !ctx.busy) await fs.rm(path.join(paths.projects, e), { recursive: true, force: true });
  }
  async function start() {
    ctx.key = await ensureKey(paths.syncDir); await cleanup(); await publish();
    if (await forgetCopiedLogin(ctx)) log('login', 'removed a Codex login copied from the Mac; Cloud signs in on its own');
    await report(false, true); // a killed worker may have left `applying` set
  }
  /** One pass over the pending inbox. Reports `applying` for the phone only while there is real work; a failure becomes `lastError`. */
  async function drain() {
    if (!ctx.key) await start(); else if (!keyPublished) await publish();
    const pending = await client.pending(); ctx.resync = new Set(pending.resync ?? []);
    const items = (pending.items ?? []).filter(due), removed = await managed(pending.removed ?? []);
    if (!items.length && !removed.length) { await report(); return 0; }
    await report(true);
    try {
      await serial(async () => { ctx.busy = true; try {
        let problem = null;
        for (const name of removed) await removeProject(ctx, name).catch(e => { log('remove failed', name, e.message); problem = { code: 'remove_failed', message: REASONS.remove_failed, project: name }; });
        for (const item of items) {
          if (stopping) break; // a graceful stop lets the current item finish and starts no new one
          const body = item.kind === 'login' ? await applyLogin(ctx, item) : await applyItem(ctx, item);
          log('applied', item.project ?? item.provider, item.kind, body.ok ? body.state ?? 'ok' : body.code ?? body.error);
          problem = problemOf(body, item.project ?? null) ?? problem;
          if (body.retry) { ctx.retryAt.set(item.id, now() + RETRY_MS * (ctx.tries.get(item.id) ?? 1)); continue; }
          ctx.tries.delete(item.id); ctx.retryAt.delete(item.id);
          const { retry, ...sent } = body; void retry; await client.applied(item.id, sent);
        }
        lastError = problem;
      } finally { ctx.busy = false; } });
    } finally { await report(false, true); }
    return items.length + removed.length;
  }
  /** Graceful stop: finish the item in hand (bounded by `ms`), start nothing new. Resolves when idle or out of time. */
  async function settle(ms = APPLY_GRACE_MS) {
    stopping = true; await Promise.race([chain, new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); })]);
  }

  // Projects this VM manages = the ones with a shadow repo (created by their first applied snapshot); no API call needed.
  const projectNames = async () => (await fs.readdir(paths.shadow).catch(() => [])).filter(e => e.endsWith('.git')).map(e => e.slice(0, -4)).filter(nameOk);
  /** Change detection (stat fingerprint of non-ignored files) -> snapshot after a quiet minute, or every 5 minutes while changing. */
  async function watchTick() {
    const t = now(); if (t - lastWatch < watchMs) return; lastWatch = t;
    for (const name of await projectNames()) {
      const shadow = path.join(paths.shadow, `${name}.git`); const root = path.join(paths.projects, name);
      if (!(await fs.lstat(shadow).catch(() => null)) || !(await fs.lstat(root).catch(() => null))?.isDirectory()) continue;
      let m = watch.get(name); if (!m) { m = { fp: null, changedAt: t - quietMs, lastSnapAt: t, lastTranscripts: t, dirty: true }; watch.set(name, m); }
      const scan = await scanWorktree({ home: paths.home, shadow, workTree: root, known: async () => new Set() }).catch(() => null); if (!scan) continue;
      const fp = fingerprint(scan.files); if (fp !== m.fp) { if (m.fp !== null) { m.changedAt = t; m.dirty = true; } m.fp = fp; }
      if (m.dirty && (t - m.changedAt >= quietMs || t - m.lastSnapAt >= periodicMs)) {
        try { await serial(() => snapshotProject(ctx, name)); m.dirty = false; m.lastSnapAt = t; } catch (e) { log('snapshot failed', name, e.message); m.lastSnapAt = t - periodicMs + 30000; }
      }
      if (t - m.lastTranscripts >= periodicMs) { m.lastTranscripts = t; await serial(() => returnTranscripts(ctx, name)).catch(e => log('transcripts failed', name, e.message)); }
    }
  }
  /** Runs until `isStopping()`. `onDrained` fires once, after the first drain attempt (successful or not): the supervisor starts the Host then. */
  async function run({ isStopping, onDrained = () => {} }) {
    let announced = false, failures = 0;
    while (!isStopping() && !stopping) {
      try { await drain(); failures = 0; await watchTick(); } catch (e) { failures++; log('sync pass failed', e.message); }
      if (!announced) { announced = true; onDrained(); }
      await sleep(Math.min(drainMs * 2 ** Math.min(failures, 4), 60000));
    }
  }
  /** Graceful-stop path: snapshot every changed project and its transcripts within `budgetMs`. */
  async function finalPass(budgetMs = FINAL_BUDGET_MS) {
    const deadline = now() + budgetMs; const out = [];
    if (!ctx.key) ctx.key = await ensureKey(paths.syncDir);
    for (const name of await projectNames()) {
      if (now() > deadline) break;
      out.push([name, await snapshotProject(ctx, name, { deadline }).catch(e => ({ sent: false, error: e.message }))]);
      if (now() < deadline) await returnTranscripts(ctx, name, { deadline }).catch(() => {});
    }
    return out;
  }
  return { start, drain, watchTick, run, finalPass, settle, ctx };
}
