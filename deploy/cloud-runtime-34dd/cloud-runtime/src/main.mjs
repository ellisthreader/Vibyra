import { EgressLimit, egressCounter } from './egress-limit.mjs';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { Client } from './client.mjs';
import { Lease } from './lease.mjs';
import { WorkerClient } from './worker-client.mjs';
import { cloneSource, headRevision } from './git.mjs';
import { runComputer } from './computer.mjs';
import { STOP_GRACE_MS, EXPIRY_GRACE_MS } from './graceful-stop.mjs';
import { FINAL_BUDGET_MS, APPLY_GRACE_MS } from './sync-loop.mjs';
const scope = { workspace: process.env.VIBYRA_WORKSPACE_ID, generation: Number(process.env.VIBYRA_GENERATION), machine: process.env.FLY_MACHINE_ID };
const client = new Client(process.env.VIBYRA_API_ORIGIN, scope.workspace, process.env.VIBYRA_BOOTSTRAP);
const lease = new Lease(process.env.VIBYRA_LEASE_PUBLIC_KEY, scope);
// Keep the independent lease watchdog alive when a build exhausts guest memory.
await fs.writeFile('/proc/self/oom_score_adj', '-1000');
let worker = new WorkerClient(); const root = '/data/project'; const journal = '/data/.supervisor';
let limits, initSource = null;
let stopping = false, ready = false, activeAction = null, computer = null;
await fs.mkdir(journal, { recursive: true, mode: 0o700 }); await fs.chmod(journal, 0o700);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checkpoint() {
  const saved = await worker.call('snapshot');
  return client.call('/checkpoint', initSource ? { files: saved.files, base: saved.base, baseCommit: saved.baseCommit } : { files: saved.files });
}
// graceMs: SIGTERM-to-SIGKILL window in computer mode. A requested stop gets the full STOP_GRACE_MS; a lease expiry gets
// EXPIRY_GRACE_MS so the independent watchdog still ends everything within a few seconds of the lease running out.
async function stop(graceMs = STOP_GRACE_MS) {
  if (stopping) return; stopping = true;
  // A requested stop may also spend up to APPLY_GRACE_MS finishing an apply and FINAL_BUDGET_MS returning the cloud's changes to the Mac (sync-loop.mjs).
  if (computer) setTimeout(() => execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], () => process.exit(0)), graceMs + 3000 + (graceMs >= STOP_GRACE_MS ? FINAL_BUDGET_MS + APPLY_GRACE_MS + 1000 : 0)).unref();
  worker.close(); await computer?.shutdown({ graceMs: typeof graceMs === 'number' ? graceMs : STOP_GRACE_MS }).catch(() => {});
  await new Promise(resolve => execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], resolve));
  // A new read-only worker snapshots after all project processes have stopped.
  worker = new WorkerClient();
  const hardExit = setTimeout(() => { worker.close(); execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], () => process.exit(0)); }, 22000);
  try { if (ready && !computer) { await worker.call('init', { root, limits, source: initSource, restore: false }); await checkpoint(); } } catch { /* Last verified checkpoint remains available with unsaved warning. */ }
  clearTimeout(hardExit); worker.close(); execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], () => process.exit(0));
}
process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
const watchdog = setInterval(() => { if (ready && !lease.active()) void stop(EXPIRY_GRACE_MS); }, 100); watchdog.unref();
try {
  let bootstrap;
  for (let n = 0; n < 20; n++) { try { bootstrap = await client.call('/bootstrap', { machineId: scope.machine, generation: scope.generation }); break; } catch { await sleep(1000); } }
  if (!bootstrap) throw Error('Bootstrap unavailable'); client.token = bootstrap.token; limits = bootstrap.limits; delete process.env.VIBYRA_BOOTSTRAP;
  if (bootstrap.mode === 'computer') {
    // Cloud computer: the headless Host is the workload. Volume is the source of truth; no legacy worker or checkpoints.
    const network = bootstrap.preview?.enabled ? new EgressLimit() : null;
    let beating = null;
    const beat = () => beating ??= (async () => {
      const reported = network ? await egressCounter() : 0;
      const status = await client.call('/heartbeat', { ready: true, ...(network ? {egressBytes:reported} : {}) });
      if (status.stop) {void stop(); throw Error('Compute stopped');}
      lease.accept(status.lease);
      try {if (network) await network.apply(lease.network, reported);}
      catch (error) {lease.expires = 0; void stop(EXPIRY_GRACE_MS); throw error;}
      ready = true;
    })().finally(() => {beating = null;});
    computer = await runComputer({ client, lease, scope, bootstrap, apiOrigin: process.env.VIBYRA_API_ORIGIN, heartbeat: beat, isStopping: () => stopping, fatal: () => {lease.expires = 0; void stop(EXPIRY_GRACE_MS);} });
    await new Promise(() => {});
  }
  const github = bootstrap.source?.type === 'github';
  if (github) {
    // Resume keeps a clone whose HEAD is the recorded base commit, with its uncommitted work.
    const recorded = bootstrap.source.baseCommit;
    const resume = !!recorded && await headRevision(root) === recorded;
    let baseCommit = recorded;
    if (!resume) {
      // DNS can lag for a moment after a fresh boot, so a failed clone is retried on an emptied tree.
      for (let attempt = 1; ; attempt++) {
        await fs.rm(root, { recursive: true, force: true }); await fs.mkdir(root, { mode: 0o755 }); await fs.chown(root, 1001, 1001);
        try { baseCommit = await cloneSource(bootstrap.source, root); break; } catch (error) { if (attempt >= 4) throw error; await sleep(3000 * attempt); }
      }
    }
    // The token lived only for the clone. Nothing below, including the project worker, ever sees it.
    delete bootstrap.source.token;
    initSource = { type: 'github', baseCommit };
    await worker.call('init', { root, limits, source: initSource, files: bootstrap.project.files, base: bootstrap.project.base, restore: !resume });
    await checkpoint();
  } else {
    await fs.rm(root, { recursive: true, force: true }); await fs.mkdir(root, { mode: 0o755 }); await fs.chown(root, 1001, 1001);
    await worker.call('init', { root, limits: bootstrap.limits, files: bootstrap.project.files, restore: true });
  }
  const heartbeat = async () => {
    const status = await client.call('/heartbeat', { ready: true });
    if (status.stop) { void stop(); return; } lease.accept(status.lease); ready = true;
    if (activeAction && status.cancelled?.includes(activeAction)) await worker.call('kill');
  };
  await heartbeat();
  const heartbeats = setInterval(() => { heartbeat().catch(() => {}); }, 5000); heartbeats.unref();
  let saving = false;
  const saves = setInterval(() => { if (stopping || saving || !lease.active()) return; saving = true; checkpoint().catch(() => {}).finally(() => { saving = false; }); }, 60000); saves.unref();
  while (!stopping) {
    if (!lease.active()) { await stop(EXPIRY_GRACE_MS); break; }
    const a = (await client.call('/actions/next')).action;
    if (!a) { await sleep(1000); continue; }
    if (a.generation !== scope.generation || a.expiresAt * 1000 <= Date.now()) throw Error('Stale action');
    activeAction = a.id; const entry = `${journal}/${a.id}.json`; let result;
    try { const saved = JSON.parse(await fs.readFile(entry)); result = saved.result ?? { error: 'Outcome unknown after interrupted execution; review files before retrying.' }; }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await fs.writeFile(entry, JSON.stringify({ intent: a.id }), { flag: 'wx', mode: 0o600 });
      try { result = await worker.call('action', { action: a }); if (['write_file', 'cloud_run_command', 'snapshot'].includes(a.operation)) {
        const saved = await checkpoint(); result = a.operation === 'snapshot' ? { saved: true, checkpoint: saved.checkpoint } : { ...result, saved: true, checkpoint: saved.checkpoint };
      } }
      catch (error) { result = { error: error.message }; }
      await fs.writeFile(entry, JSON.stringify({ intent: a.id, result }), { mode: 0o600 });
    }
    // Retry only the receipt. Never repeat an ambiguous command.
    while (!stopping && lease.active()) { try { await client.call(`/actions/${a.id}/result`, { result }); break; } catch (e) {
      if ([401, 403].includes(e.status)) { void stop(); break; }
      if ([409, 410, 422].includes(e.status)) break;
      await sleep(1000);
    } }
    activeAction = null;
  }
} catch { await stop(); }
