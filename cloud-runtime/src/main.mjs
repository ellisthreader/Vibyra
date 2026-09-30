import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { Client } from './client.mjs';
import { Lease } from './lease.mjs';
import { WorkerClient } from './worker-client.mjs';
const scope = { workspace: process.env.VIBYRA_WORKSPACE_ID, generation: Number(process.env.VIBYRA_GENERATION), machine: process.env.FLY_MACHINE_ID };
const client = new Client(process.env.VIBYRA_API_ORIGIN, scope.workspace, process.env.VIBYRA_BOOTSTRAP);
const lease = new Lease(process.env.VIBYRA_LEASE_PUBLIC_KEY, scope);
// Keep the independent lease watchdog alive when a build exhausts guest memory.
await fs.writeFile('/proc/self/oom_score_adj', '-1000');
let worker = new WorkerClient(); const root = '/data/project'; const journal = '/data/.supervisor';
let limits;
let stopping = false, ready = false, activeAction = null;
await fs.mkdir(journal, { recursive: true, mode: 0o700 }); await fs.chmod(journal, 0o700);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checkpoint() { const files = (await worker.call('snapshot')).files; return client.call('/checkpoint', { files }); }
async function stop() {
  if (stopping) return; stopping = true;
  worker.close();
  await new Promise(resolve => execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], resolve));
  // A new read-only worker snapshots after all project processes have stopped.
  worker = new WorkerClient();
  const hardExit = setTimeout(() => { worker.close(); execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], () => process.exit(0)); }, 22000);
  try { if (ready) { await worker.call('init', { root, limits, restore: false }); await checkpoint(); } } catch { /* Last verified checkpoint remains available with unsaved warning. */ }
  clearTimeout(hardExit); worker.close(); execFile('/usr/bin/pkill', ['-KILL', '-u', '1001'], () => process.exit(0));
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
const watchdog = setInterval(() => { if (ready && !lease.active()) void stop(); }, 100); watchdog.unref();
try {
  let bootstrap;
  for (let n = 0; n < 20; n++) { try { bootstrap = await client.call('/bootstrap', { machineId: scope.machine, generation: scope.generation }); break; } catch { await sleep(1000); } }
  if (!bootstrap) throw Error('Bootstrap unavailable'); client.token = bootstrap.token; limits = bootstrap.limits; delete process.env.VIBYRA_BOOTSTRAP;
  await fs.rm(root, { recursive: true, force: true }); await fs.mkdir(root, { mode: 0o755 }); await fs.chown(root, 1001, 1001);
  await worker.call('init', { root, limits: bootstrap.limits, files: bootstrap.project.files, restore: true });
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
    if (!lease.active()) { await stop(); break; }
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
