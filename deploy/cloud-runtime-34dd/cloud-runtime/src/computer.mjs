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
  // Cloud sync directories (key/state, shadow repos, scratch): same rule, root prepares only these entries directly under /data.
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
  const cloneCfg = { projectsDir: paths.projects, uid: root ? uid : null, gid: root ? gid : null, paths, urlFor: githubUrl,
    env: { PATH: env.PATH, HOME: env.HOME, TMPDIR: env.TMPDIR, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_SYSTEM: paths.gitconfig, VIBYRA_GIT_SOCKET: paths.socket } };
  const shutdown = async ({ graceMs = STOP_GRACE_MS } = {}) => { clearInterval(beats);
    // A requested stop first lets sync finish the item it is applying; the Host and terminals are signalled after.
    if (sync?.settle && graceMs >= STOP_GRACE_MS) await sync.settle(APPLY_GRACE_MS).catch(() => {});
    await gracefulStop({ host, userUid: root ? uid : null, graceMs, ...(sync ? { finalSync: () => (graceMs >= STOP_GRACE_MS ? sync.final(FINAL_BUDGET_MS) : sync.halt()) } : {}), ...(exec ? { exec } : {}), ...(sleepFn ? { sleep: sleepFn } : {}), ...(now ? { now } : {}) }); await graphical?.stop(); await proxy.close().catch(() => {}); await fs.rm(paths.tokenFile, { force: true }).catch(() => {}); };
  (async () => { while (!isStopping()) { if (lease.active()) await drainProjects(client, cloneCfg).catch(() => {}); await sleep(5000); } })();
  return { shutdown, host };
}
