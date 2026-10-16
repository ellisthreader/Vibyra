import { execFile } from 'node:child_process';

/** Grace between SIGTERM and SIGKILL for a user-initiated or deadline stop, and for a lease expiry (kept short: the lease is the hard limit). */
export const STOP_GRACE_MS = 10000;
export const EXPIRY_GRACE_MS = 5000;

export const runCommand = (cmd, args, { timeoutMs = 4000 } = {}) => new Promise(resolve => { try { execFile(cmd, args, { timeout: timeoutMs, killSignal: 'SIGKILL' }, error => resolve(error ? (typeof error.code === 'number' ? error.code : -1) : 0)); } catch { resolve(-1); } });

/**
 * SIGTERM the Host group and project uid, then observe quiescence (hard-stop stragglers after the grace).
 * Only then run the bounded final snapshot. An unknown/still-live writer refuses the snapshot.
 */
export async function gracefulStop({ host = null, userUid = null, graceMs = STOP_GRACE_MS, finalSync = null, exec = runCommand, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, tickMs = 100, signal = null } = {}) {
  const deadline = now() + graceMs;
  host?.signal('SIGTERM');
  if (userUid != null) await exec('/usr/bin/pkill', ['-TERM', '-u', String(userUid)], { timeoutMs: 1000 });
  const alive = async (timeoutMs = 1000) => {
    const hostUp = host?.groupAlive() ?? false;
    const status = userUid == null ? 1 : await exec('/usr/bin/pgrep', ['-u', String(userUid)], { timeoutMs });
    if (status !== 0 && status !== 1) throw Error('Could not verify that Cloud writers stopped');
    return hostUp || status === 0;
  };
  let quiet = false;
  try {
    while (!signal?.aborted && now() < deadline) {
      if (!(await alive(Math.max(1, Math.min(1000, deadline - now()))))) { quiet = true; break; }
      await sleep(tickMs);
    }
  } catch { /* A failed probe requires a hard stop and a fresh positive absence check. */ }
  try {
    if (!quiet) {
      const hardDeadline = now() + 1000;
      for (let round = 0; round < 10 && now() < hardDeadline; round++) {
        host?.kill();
        const budget = () => Math.max(1, Math.min(100, hardDeadline - now()));
        if (userUid != null) await exec('/usr/bin/pkill', ['-KILL', '-u', String(userUid)], { timeoutMs: budget() });
        try { quiet = !(await alive(budget())); } catch { quiet = false; }
        if (quiet) break;
        await sleep(Math.min(100, Math.max(0, hardDeadline - now())));
      }
    }
    if (!quiet) throw Error('Cloud writers did not stop; final sync was not attempted');
    if (finalSync && !signal?.aborted) await Promise.resolve(finalSync()).catch(() => {});
    await exec('/bin/sync', []);
  } finally {
    host?.kill();
    if (userUid != null) {
      const cleanupDeadline = now() + 1000;
      const budget = () => Math.max(1, Math.min(100, cleanupDeadline - now()));
      // Bound the entire cleanup sweep, including failed process commands, inside the outer watchdog.
      for (let round = 0; round < 10 && now() < cleanupDeadline; round++) {
        await exec('/usr/bin/pkill', ['-KILL', '-u', String(userUid)], { timeoutMs: budget() });
        if (await exec('/usr/bin/pgrep', ['-u', String(userUid)], { timeoutMs: budget() }) === 1) break;
        await sleep(Math.min(100, Math.max(0, cleanupDeadline - now())));
      }
    }
  }
}
