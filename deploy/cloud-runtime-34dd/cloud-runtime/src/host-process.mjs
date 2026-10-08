import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs/promises';

/** Argument list for `vibyra-host` in account mode. No secret is on the command line: the token is a file. */
export function hostArgs(c) {
  return ['--account-mode', '--api-base', c.apiBase, '--workspace-id', c.workspaceId, '--runtime-token-file', c.tokenFile,
    '--state-dir', c.stateDir, '--projects-dir', c.projectsDir, '--activity-interval', String(c.activitySeconds ?? 15),
    ...(c.name ? ['--name', c.name] : [])];
}
/** The Host and every terminal under it start from this fixed environment. Nothing is inherited from the supervisor. */
export function hostEnv(c) {
  return { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: c.home, TMPDIR: c.tmp ?? '/tmp/project', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_SYSTEM: c.gitconfig, VIBYRA_GIT_SOCKET: c.socket, VIBYRA_CLOUD_COMPUTER: '1',
    ...(c.preview ? { VIBYRA_CLOUD_PREVIEW: '1' } : {}),
    ...(c.native ? { VIBYRA_CLOUD_NATIVE_PREVIEW: '1', ...c.graphicalEnv } : {}) };
}
/** Writes the runtime token where only root can change it and the Host user (group) can read it. */
export async function writeTokenFile(file, token, gid = null) {
  await fs.writeFile(file, token, { mode: 0o440 }); await fs.chmod(file, 0o440);
  if (gid !== null && process.getuid?.() === 0) await fs.chown(file, 0, gid);
}

/** Keeps the Host running while `valid()` holds: restarts with backoff on exit, kills the process group on stop. */
export class HostSupervisor {
  constructor({ bin, args, env, uid = null, gid = null, valid, backoffMs = [1000, 2000, 5000, 10000, 30000], stableMs = 60000, spawn = nodeSpawn, onEvent = () => {} }) {
    Object.assign(this, { bin, args, env, uid, gid, valid, backoffMs, stableMs, spawn, onEvent });
    this.child = null; this.stopped = false; this.starts = 0; this.failures = 0; this.timer = null;
  }
  start() { this.stopped = false; this.#launch(); }
  #launch() {
    if (this.stopped || !this.valid()) return;
    const opts = { env: this.env, stdio: ['ignore', 'inherit', 'inherit'], detached: true };
    if (this.uid !== null) { opts.uid = this.uid; opts.gid = this.gid ?? this.uid; }
    const began = Date.now(); this.starts++;
    let child; try { child = this.spawn(this.bin, this.args, opts); } catch { return this.#again(began); }
    this.child = child; this.onEvent('start');
    child.on('error', () => {}); child.on('exit', code => { if (this.child === child) this.child = null; this.onEvent('exit', code); this.#again(began); });
  }
  #again(began) {
    if (this.stopped || !this.valid()) return;
    this.failures = Date.now() - began >= this.stableMs ? 0 : this.failures + 1;
    const wait = this.backoffMs[Math.min(Math.max(this.failures - 1, 0), this.backoffMs.length - 1)];
    this.timer = setTimeout(() => this.#launch(), wait); this.timer.unref?.();
  }
  kill() {
    this.stopped = true; clearTimeout(this.timer);
    const child = this.child; this.child = null;
    if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
  }
  /** Sends a signal to the whole Host process group without marking it dead; the supervisor stops restarting it. */
  signal(sig) {
    this.stopped = true; clearTimeout(this.timer);
    const pid = this.child?.pid; if (!pid) return;
    try { process.kill(-pid, sig); } catch { try { this.child.kill(sig); } catch { /* gone */ } }
  }
  groupAlive() { const pid = this.child?.pid; if (!pid) return false; try { process.kill(-pid, 0); return true; } catch { return false; } }
  get running() { return !!this.child; }
}
