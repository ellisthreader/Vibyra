import { execFile } from 'node:child_process';

/** Grace between SIGTERM and SIGKILL for a user-initiated or deadline stop, and for a lease expiry (kept short: the lease is the hard limit). */
export const STOP_GRACE_MS = 10000;
export const EXPIRY_GRACE_MS = 5000;

export const runCommand = (cmd, args) => new Promise(resolve => { try { execFile(cmd, args, { timeout: 4000 }, error => resolve(error ? (typeof error.code === 'number' ? error.code : 1) : 0)); } catch { resolve(1); } });

/**
 * SIGTERM the Host process group and every uid-`userUid` process, wait up to `graceMs` for them to leave, `sync`,
 * run the optional `finalSync` (cloud sync's last return snapshot, 8 s budget of its own), then SIGKILL stragglers. Clock, sleep and command runner are injectable so tests run on fake time.
 */
export async function gracefulStop({ host = null, userUid = null, graceMs = STOP_GRACE_MS, finalSync = null, exec = runCommand, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, tickMs = 100 } = {}) {
  const deadline = now() + graceMs;
  host?.signal('SIGTERM');
  if (userUid != null) await exec('/usr/bin/pkill', ['-TERM', '-u', String(userUid)]);
  while (now() < deadline) {
    const hostUp = host?.groupAlive() ?? false;
    const usersUp = userUid != null && await exec('/usr/bin/pgrep', ['-u', String(userUid)]) === 0;
    if (!hostUp && !usersUp) break;
    await sleep(tickMs);
  }
  // Host and terminals have left (or the grace is over): last chance to return the cloud's changes to the Mac. Bounded by finalSync itself.
  if (finalSync) await Promise.resolve(finalSync()).catch(() => {});
  await exec('/bin/sync', []);
  host?.kill();
  if (userUid != null) {
    await exec('/usr/bin/pkill', ['-KILL', '-u', String(userUid)]);
    // A single pkill scans /proc once, so a process that forks while it runs (a fork loop, a shell spawning children)
    // can leave a survivor. Repeat until nothing of the project user is left (bounded: ~1 s).
    for (let round = 0; round < 10 && await exec('/usr/bin/pgrep', ['-u', String(userUid)]) === 0; round++) {
      await sleep(100); await exec('/usr/bin/pkill', ['-KILL', '-u', String(userUid)]);
    }
  }
}
