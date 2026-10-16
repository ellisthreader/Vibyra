import { AGENT_UIDS } from './agent-slots.mjs';
import { spawn, execFile } from 'node:child_process';

/** Only the exclusive production container Agent uid is eligible for uid-wide cleanup. */
const dedicated = uid => process.platform === 'linux' && process.getuid?.() === 0 && [...AGENT_UIDS, 1006].includes(uid);
function reapAgentUid(uid) {
  if (!dedicated(uid)) return Promise.resolve();
  return new Promise(resolve => execFile('/usr/bin/pkill', ['-KILL', '-u', String(uid)], () => resolve()));
}
/** All control input is private stdin; no cloud lease/session key enters a provider environment. */
export const agentChild = request => isolatedChild(request, AGENT_UIDS);
export const browserChild = request => isolatedChild(request, [1006]);
function isolatedChild({ bin, args = [], input, home, uid = null, gid = null, valid, timeout = 3700000, spawnFn = spawn }, identities) {
  if (uid !== null && (!dedicated(uid) || !identities.includes(uid) || gid !== uid)) return Promise.reject(Error('Dedicated Agent identity required.'));
  return new Promise((resolve, reject) => {
    const child = spawnFn(bin, args, { env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8' },
      stdio: ['pipe', 'pipe', 'ignore'], detached: true, ...(uid === null ? {} : { uid, gid }) });
    let output = '', failed = false, hardStop = null;
    const signal = sig => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* exited */ } } };
    const kill = () => { if (hardStop) return; signal('SIGTERM'); hardStop = setTimeout(() => signal('SIGKILL'), 5000); };
    const timer = setTimeout(() => { failed = true; kill(); }, timeout);
    const watchdog = setInterval(() => { if (!valid()) { failed = true; kill(); } }, 100);
    const clear = () => { clearTimeout(timer); clearTimeout(hardStop); clearInterval(watchdog); };
    child.stdout.on('data', data => { output += data; if (output.length > 65536) { failed = true; kill(); } });
    child.on('error', () => { clear(); reject(Error('Cloud Agent could not start.')); });
    child.on('exit', async code => {
      // Parent exit does not imply descendants exited. Kill its group before cancelling the timer,
      // then reap this slot’s exclusive Agent uid (Claude establishes a separate group) before another launch.
      signal('SIGKILL'); clear(); await reapAgentUid(uid);
      code === 0 && !failed ? resolve(output) : reject(Error('Cloud Agent attempt stopped.'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
