import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';

/** Private software-rendered Linux desktop; no VNC, X11 TCP or public listener. */
export async function startGraphicalSession({ run, uid, gid, valid, onFailure = () => {}, spawn = nodeSpawn, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(gid) || !valid()) throw new Error('Graphical session requires a leased non-root user');
  const dir = `${run}/display`;
  await fs.mkdir(dir, { mode: 0o700 }); // refuse leftovers instead of following a project-written symlink
  await fs.chown(dir, uid, gid);
  const auth = `${dir}/Xauthority`, cookie = randomBytes(16).toString('hex');
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', HOME: '/data/home',
    DISPLAY: ':88', XAUTHORITY: auth, XDG_RUNTIME_DIR: dir, DBUS_SESSION_BUS_ADDRESS: `unix:path=${dir}/bus`,
    LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe', QT_X11_NO_MITSHM: '1' };
  const children = [];
  let stopped = false;
  const launch = (bin, args) => {
    if (!valid()) throw new Error('Compute lease expired');
    const child = spawn(bin, args, { uid, gid, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
    children.push(child); child.on('error', () => {}); return child;
  };
  const stop = async () => {
    stopped = true; clearInterval(watchdog);
    const exits = children.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(resolve, 2000); child.once('exit', () => {clearTimeout(timer); resolve();});
    }));
    for (const child of children) {try { process.kill(-child.pid, 'SIGKILL'); } catch {try {child.kill('SIGKILL');} catch {}}}
    await Promise.all(exits);
    const x = children.find(child => child.spawnfile === '/usr/bin/Xvfb');
    const lock = '/tmp/.X88-lock';
    if (x && Number((await fs.readFile(lock, 'utf8').catch(() => '')).trim()) === x.pid) {
      await fs.rm(lock, {force:true}); await fs.rm('/tmp/.X11-unix/X88', {force:true});
    }
    await fs.rm(dir, { recursive: true, force: true });
  };
  let watchdog;
  try {
    const xauth = launch('/usr/bin/xauth', ['-f', auth, 'add', ':88', 'MIT-MAGIC-COOKIE-1', cookie]);
    await new Promise((resolve, reject) => {xauth.once('error', reject); xauth.once('exit', code => code === 0 ? resolve() : reject(new Error('X11 authorization failed')));});
    children.pop();
    const x = launch('/usr/bin/Xvfb', [':88', '-screen', '0', '1440x900x24', '-nolisten', 'tcp', '-auth', auth, '-noreset']);
    let ready = false;
    for (let i = 0; i < 80 && valid(); i++) {
      if (x.exitCode !== null) throw new Error('Virtual display did not start');
      try {await fs.stat('/tmp/.X11-unix/X88'); ready = true; break;} catch {}
      await sleep(100);
    }
    if (!ready) throw new Error('Virtual display readiness timed out');
    launch('/usr/bin/dbus-daemon', ['--session', '--nofork', `--address=${env.DBUS_SESSION_BUS_ADDRESS}`, '--nopidfile', '--nosyslog']);
    launch('/usr/bin/openbox', ['--sm-disable']);
    watchdog = setInterval(() => {
      if (!stopped && (!valid() || children.some(child => child.exitCode !== null || child.signalCode !== null))) {void stop(); onFailure();}
    }, 1000); watchdog.unref();
    return { env, stop, healthy: () => !stopped && children.every(child => child.exitCode === null) };
  } catch (error) {await stop(); throw error;}
}
