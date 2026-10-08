import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync-worker.mjs');
/**
 * Supervisor side of sync (runs as root, touches nothing inside /data itself): starts the uid-1001 worker, waits for its first
 * drain (bounded), restarts it while the lease is valid, and runs the one-shot final pass during graceful stop.
 */
export function createSyncProcess({ paths, origin, workspace, tokenFile, uid = null, gid = null, valid = () => true, spawn = nodeSpawn, node = process.execPath, worker = WORKER, bootMs = 120000, restartMs = 5000, log = () => {} }) {
  const cfg = JSON.stringify({ origin, workspace, tokenFile, paths: { home: paths.home, projects: paths.projects, shadow: paths.shadow, tmp: paths.syncTmp, syncDir: paths.syncDir } });
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: paths.home, TMPDIR: '/tmp/project', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', VIBYRA_SYNC_CFG: cfg };
  const opts = () => ({ env, cwd: '/', stdio: ['ignore', 'pipe', 'inherit'], detached: true, ...(uid != null ? { uid, gid: gid ?? uid } : {}) });
  let child = null, halted = false, onDrained = () => {}, timer = null;
  const killGroup = (c, sig) => { try { if (!c.pid) throw Error('no pid'); process.kill(-c.pid, sig); } catch { try { c.kill(sig); } catch { /* gone */ } } };
  function launch() {
    if (halted || !valid()) return; let c;
    try { c = spawn(node, [worker, 'serve'], opts()); } catch { timer = setTimeout(launch, restartMs); timer.unref?.(); return; }
    child = c; let buf = '';
    c.stdout?.on('data', d => { buf += d; if (buf.includes('drained')) { buf = ''; onDrained(); } });
    c.on('error', () => {}); c.on('exit', () => { if (child === c) child = null; onDrained(); if (!halted) { timer = setTimeout(launch, restartMs); timer.unref?.(); } });
  }
  return {
    /** Starts the worker; resolves 'drained', 'timeout' (the worker keeps draining in the background) or 'halted'. */
    boot() {
      return new Promise(resolve => {
        const t = setTimeout(() => done('timeout'), bootMs); t.unref?.(); const poll = setInterval(() => { if (halted || !valid()) done('halted'); }, 250); poll.unref?.();
        const done = r => { clearTimeout(t); clearInterval(poll); resolve(r); };
        onDrained = () => done(halted ? 'halted' : 'drained'); launch();
      });
    },
    /** Graceful stop, before anything else is signalled: the serve worker finishes the item it is applying (it was told on
     *  SIGTERM to its own pid only, so the git processes under it keep running) and leaves; bounded by `ms`. No restart after. */
    async settle(ms) {
      halted = true; clearTimeout(timer); const c = child; if (!c) return;
      await new Promise(r => { c.once('exit', r); try { c.kill('SIGTERM'); } catch { r(); } setTimeout(r, ms + 1000).unref?.(); });
    },
    /** Stops the serve worker for good (no restart). */
    async halt() { halted = true; clearTimeout(timer); const c = child; if (!c) return; killGroup(c, 'SIGTERM'); await new Promise(r => { c.once('exit', r); setTimeout(r, 1500).unref?.(); }); killGroup(c, 'SIGKILL'); },
    /** One last return pass as uid 1001, hard-limited to `budgetMs`. Never throws. */
    async final(budgetMs = 8000) {
      await this.halt();
      return new Promise(resolve => {
        let c; try { c = spawn(node, [worker, 'final', String(budgetMs)], opts()); } catch { return resolve(null); }
        let out = ''; c.stdout?.on('data', d => { out += d; }); const t = setTimeout(() => killGroup(c, 'SIGKILL'), budgetMs + 500);
        c.on('error', () => { clearTimeout(t); resolve(null); }); c.on('exit', () => { clearTimeout(t); try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve(null); } });
      });
    },
    get running() { return !!child; },
  };
}
