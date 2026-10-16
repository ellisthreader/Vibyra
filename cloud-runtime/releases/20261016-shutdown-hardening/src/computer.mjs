import { AGENT_SLOTS, agentSlot } from './agent-slots.mjs';
import { startAgents } from './agents.mjs';
import { startGraphicalSession } from './graphical-session.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PATHS, PROJECT_UID, PROJECT_GID, ACTIVITY_SECONDS } from './computer-paths.mjs';
import { startCredentialProxy, apiCredential } from './credential-proxy.mjs';
import { HostSupervisor, hostArgs, hostEnv, writeTokenFile } from './host-process.mjs';
import { gracefulStop, STOP_GRACE_MS } from './graceful-stop.mjs';
import { ensureOwnedDir, realOps } from './safe-dirs.mjs';
import { drainProjects, githubUrl } from './projects.mjs';
import { createSyncProcess } from './sync-process.mjs';
import { FINAL_BUDGET_MS, APPLY_GRACE_MS } from './sync-loop.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Cloud-computer mode (bootstrap reply `mode: 'computer'`): the supervisor keeps the lease and heartbeat, and runs
 * the headless Host as the project user. The legacy worker, action loop and S3 checkpoints are not used.
 * Returns { shutdown } and runs until `isStopping()`.
 */
export async function runComputer({ client, lease, scope, bootstrap, apiOrigin, heartbeat, isStopping, paths = PATHS, ops, exec, sleep: sleepFn, now, uid = PROJECT_UID, gid = PROJECT_GID, sync: syncOverride, fatal = () => {} }) {
  const root = process.getuid?.() === 0;
  // Root only prepares these entries under their root-owned parent; it never follows or recurses into them (see safe-dirs.mjs).
  for (const dir of [paths.home, paths.hostState, paths.projects]) await ensureOwnedDir(dir, path.dirname(dir), { uid, gid, trustedUid: root ? 0 : process.getuid(), ops: ops ?? (root ? realOps : { chownFd: async () => {} }) });
  if (paths.agentRuns) for (let slot=0;slot<=AGENT_SLOTS;slot++) {
    const agent=agentSlot(slot,paths.agentHome,paths.agentRuns);
    for (const dir of [agent.runs,agent.home]) await ensureOwnedDir(dir,path.dirname(dir),{
      mode:0o700,uid:root?agent.uid:process.getuid(),gid:root?agent.gid:process.getgid(),trustedUid:root?0:process.getuid(),
      ops:ops??(root?realOps:{chownFd:async()=>{}})});
  }
  // Cloud sync directories (key/state, shadow repos, scratch): same rule, root prepares only these entries directly under /data.
  if(paths.browserHome) await ensureOwnedDir(paths.browserHome,path.dirname(paths.browserHome),{
    mode:0o700,uid:root?1006:process.getuid(),gid:root?1006:process.getgid(),trustedUid:root?0:process.getuid(),
    ops:ops??(root?realOps:{chownFd:async()=>{}})});
  if (paths.syncDir) for (const dir of [paths.syncDir, paths.shadow, paths.syncTmp]) await ensureOwnedDir(dir, path.dirname(dir), { uid, gid, trustedUid: root ? 0 : process.getuid(), ops: ops ?? (root ? realOps : { chownFd: async () => {} }) });
  await fs.mkdir(paths.run, { recursive: true, mode: 0o750 }); await fs.chmod(paths.run, 0o750); if (root) await fs.chown(paths.run, 0, gid);
  await writeTokenFile(paths.tokenFile, client.token, root ? gid : null);
  const proxy = await startCredentialProxy({ socketPath: paths.socket, fetchCredential: apiCredential(client), gid: root ? gid : null });
  await heartbeat();
  const graphical = bootstrap.preview?.enabled && bootstrap.preview?.native ? await startGraphicalSession({ run: paths.run, uid, gid, valid: () => !isStopping() && lease.active(), onFailure: fatal }) : null;
  const env = hostEnv({ home: paths.home, gitconfig: paths.gitconfig, socket: paths.socket, preview: bootstrap.preview?.enabled === true, native: !!graphical, graphicalEnv: graphical?.env });
  const host = new HostSupervisor({ bin: paths.hostBin, env, uid: root ? uid : null, gid: root ? gid : null, valid: () => !isStopping() && lease.active() && (!graphical || graphical.healthy()),
    args: hostArgs({ apiBase: apiOrigin, workspaceId: scope.workspace, tokenFile: paths.tokenFile, stateDir: paths.hostState, projectsDir: paths.projects,
      activitySeconds: ACTIVITY_SECONDS, name: bootstrap.name }) });
  const beats = setInterval(() => { heartbeat().catch(() => {}); }, 5000); beats.unref();
  // Pending cloud-sync inbox first (bounded 120 s; the worker keeps draining in the background past that), then the Host.
  const sync = syncOverride ?? (paths.syncDir ? createSyncProcess({ paths, origin: apiOrigin, workspace: scope.workspace, tokenFile: paths.tokenFile, uid: root ? uid : null, gid: root ? gid : null, valid: () => !isStopping() && lease.active() }) : null);
  if (sync) await sync.boot().catch(() => {});
  host.start();
  const agents = paths.agentBin && bootstrap.cloudAgents?.enabled === true ? startAgents({ client, scope, origin: apiOrigin, home: paths.agentHome,
    uid: root ? 1002 : null, gid: root ? 1002 : null, bin: paths.agentBin,
    browserBin:paths.browserBin,browserHome:paths.browserHome,
    valid: () => !isStopping() && lease.active() }) : null;
  const cloneCfg = { projectsDir: paths.projects, uid: root ? uid : null, gid: root ? gid : null, paths, urlFor: githubUrl,
    env: { PATH: env.PATH, HOME: env.HOME, TMPDIR: env.TMPDIR, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_SYSTEM: paths.gitconfig, VIBYRA_GIT_SOCKET: paths.socket } };
  const shutdown = async ({ graceMs = STOP_GRACE_MS, signal = null } = {}) => {
    clearInterval(beats);
    let wake; const interrupted = new Promise(resolve => { wake = resolve; });
    const abort = () => { host.kill(); void Promise.resolve(sync?.halt()).catch(() => {}); wake(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const wait = promise => Promise.race([promise, interrupted]);
    try {
      await wait(agents?.stop());
      // Expiry/fatal cancellation bypasses pending agents and apply; it can never begin a final export.
      if (sync?.settle && graceMs >= STOP_GRACE_MS && !signal?.aborted && lease.active()) await wait(sync.settle(APPLY_GRACE_MS).catch(() => {}));
      await gracefulStop({ host, userUid: root ? uid : null, graceMs, signal,
        ...(sync ? { finalSync: () => graceMs >= STOP_GRACE_MS && !signal?.aborted && lease.active()
          ? sync.final(FINAL_BUDGET_MS, { signal, valid: () => lease.active() && !signal?.aborted }) : sync.halt() } : {}),
        ...(exec ? { exec } : {}), ...(sleepFn ? { sleep: sleepFn } : {}), ...(now ? { now } : {}) });
    } finally {
      signal?.removeEventListener('abort', abort);
      await graphical?.stop(); await proxy.close().catch(() => {}); await fs.rm(paths.tokenFile, { force: true }).catch(() => {});
    }
  };
  (async () => { while (!isStopping()) { if (lease.active()) await drainProjects(client, cloneCfg).catch(() => {}); await sleep(5000); } })();
  return { shutdown, host };
}
