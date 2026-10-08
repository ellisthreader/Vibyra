import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmp, sleep } from './sync-helpers.mjs';
import { gracefulStop, STOP_GRACE_MS, EXPIRY_GRACE_MS } from '../src/graceful-stop.mjs';
import { runComputer } from '../src/computer.mjs';
import { FINAL_BUDGET_MS, APPLY_GRACE_MS } from '../src/sync-loop.mjs';
import { createSyncProcess } from '../src/sync-process.mjs';
import { PATHS } from '../src/computer-paths.mjs';

const until = async (f, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await sleep(20); } return false; };

test('graceful stop: the final sync runs after the Host has left and before the filesystem sync and the kill', async () => {
  const log = []; let t = 0, up = true;
  const host = { signal: s => log.push(`host ${s}`), groupAlive: () => up, kill: () => log.push('host KILL') };
  const exec = async (c, a) => { log.push(`${c.split('/').pop()} ${a.join(' ')}`); return c.endsWith('pgrep') ? (up ? 0 : 1) : 0; };
  await gracefulStop({ host, userUid: 1001, graceMs: STOP_GRACE_MS, exec, now: () => t, sleep: async ms => { t += ms; if (t >= 300) up = false; },
    finalSync: async () => { log.push(`FINAL (host alive: ${up})`); } });
  const steps = log.filter(l => !l.startsWith('pgrep')); assert.deepEqual(steps, ['host SIGTERM', 'pkill -TERM -u 1001', 'FINAL (host alive: false)', 'sync ', 'host KILL', 'pkill -KILL -u 1001']);
});
test('graceful stop: a failing or hanging-then-throwing final sync never blocks the kill', async () => {
  const log = []; const host = { signal() {}, groupAlive: () => false, kill: () => log.push('host KILL') };
  await gracefulStop({ host, userUid: null, graceMs: 100, exec: async () => 1, finalSync: async () => { throw Error('boom'); } }); assert.deepEqual(log, ['host KILL']);
});
test('production paths include the sync directories directly under /data (so root only prepares top-level entries)', () => {
  for (const k of ['syncDir', 'shadow', 'syncTmp']) assert.equal(path.dirname(PATHS[k]), '/data');
});

function rig(t, makeSync) {
  const state = { stopping: false };
  const ready = (async () => {
    const d = await tmp(t); const log = path.join(d, 'order.log'); const order = s => fs.appendFile(log, `${s}\n`);
    const script = path.join(d, 'fake-host.mjs'); await fs.writeFile(script, `import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(log)}, 'host-start\\n');setInterval(()=>{},1000);`);
    const bin = path.join(d, 'vibyra-host'); await fs.writeFile(bin, `#!/bin/sh\nexec ${process.execPath} ${script} "$@"\n`, { mode: 0o755 });
    const paths = { run: path.join(d, 'run'), socket: path.join(d, 'run/git.sock'), tokenFile: path.join(d, 'run/token'), home: path.join(d, 'home'), hostState: path.join(d, 'host'), projects: path.join(d, 'projects'),
      syncDir: path.join(d, '.vibyra-sync'), shadow: path.join(d, '.vibyra-shadow'), syncTmp: path.join(d, '.vibyra-tmp'), hostBin: bin, gitconfig: '/etc/gitconfig', helper: '/x', hooks: '/y' };
    const chowned = []; const ops = { chownFd: async (fh, uid, gid) => { chowned.push({ dir: null, ino: (await fh.stat()).ino, uid, gid }); } };
    const client = { token: 'rt-secret', call: async p => (p === '/projects/pending' ? { ok: true, projects: [] } : { ok: true }) };
    const run = runComputer({ client, lease: { active: () => true }, scope: { workspace: 'ws' }, bootstrap: {}, apiOrigin: 'https://api.example', heartbeat: async () => { await order('heartbeat'); },
      isStopping: () => state.stopping, paths, ops, uid: 1001, gid: 1001, sync: makeSync(order) });
    t.after(async () => { state.stopping = true; const c = await run.catch(() => null); await c?.shutdown({ graceMs: 200 }); });
    return { run, paths, chowned, log };
  })();
  return ready;
}
test('computer mode: the sync inbox is drained (boot) before the Host starts, and the sync directories are prepared like the other volume dirs', async t => {
  let release; const gate = new Promise(r => { release = r; }); const calls = [];
  const { run, paths, chowned, log } = await rig(t, order => ({ boot: async () => { await order('sync-boot-begin'); await gate; await order('sync-boot-end'); }, final: async () => { calls.push('final'); }, halt: async () => { calls.push('halt'); } }));
  assert.ok(await until(async () => (await fs.readFile(log, 'utf8').catch(() => '')).includes('sync-boot-begin'))); await sleep(300);
  assert.equal(await fs.readFile(log, 'utf8'), 'heartbeat\nsync-boot-begin\n', 'Host must not start while the inbox is draining');
  assert.equal(chowned.length, 6); assert.ok(chowned.every(c => c.uid === 1001 && c.gid === 1001)); for (const k of ['syncDir', 'shadow', 'syncTmp']) assert.ok((await fs.lstat(paths[k])).isDirectory());
  release(); const c = await run; assert.ok(await until(async () => (await fs.readFile(log, 'utf8')).includes('host-start')));
  assert.equal((await fs.readFile(log, 'utf8')).split('\n').filter(Boolean).join(','), 'heartbeat,sync-boot-begin,sync-boot-end,host-start');
  void c;
});
test('computer mode: a user-requested stop runs the 8 s final sync; a lease-expiry stop only halts the worker', async t => {
  const calls = []; const { run } = await rig(t, () => ({ boot: async () => {}, settle: async ms => { calls.push(['settle', ms]); }, final: async ms => { calls.push(['final', ms]); }, halt: async () => { calls.push(['halt']); } }));
  const c = await run; await c.shutdown({ graceMs: STOP_GRACE_MS, sleep: async () => {} }).catch(() => {});
  // The apply in hand finishes first, then the Host leaves, then the final return pass.
  assert.deepEqual(calls.slice(0, 2), [['settle', APPLY_GRACE_MS], ['final', FINAL_BUDGET_MS]]); assert.equal(FINAL_BUDGET_MS, 8000);
  const calls2 = []; const second = await rig(t, () => ({ boot: async () => {}, settle: async ms => { calls2.push(['settle', ms]); }, final: async ms => { calls2.push(['final', ms]); }, halt: async () => { calls2.push(['halt']); } }));
  await (await second.run).shutdown({ graceMs: EXPIRY_GRACE_MS }); assert.deepEqual(calls2, [['halt']]);
});
test('computer mode: a boot that never finishes does not wedge when the sync object is absent (no syncDir configured)', async t => {
  const d = await tmp(t); const paths = { run: path.join(d, 'run'), socket: path.join(d, 'run/git.sock'), tokenFile: path.join(d, 'run/token'), home: path.join(d, 'home'), hostState: path.join(d, 'host'), projects: path.join(d, 'projects'), hostBin: '/bin/true', gitconfig: '/x', helper: '/x', hooks: '/y' };
  let stopping = false; const c = await runComputer({ client: { token: 't', call: async () => ({ ok: true, projects: [] }) }, lease: { active: () => true }, scope: { workspace: 'ws' }, bootstrap: {}, apiOrigin: 'https://api.example', heartbeat: async () => {}, isStopping: () => stopping, paths, uid: 1001, gid: 1001 });
  stopping = true; await c.shutdown({ graceMs: 100 }); assert.ok(c.host);
});

test('sync process: settle signals only the worker, waits for it to finish its item, and never restarts it', async t => {
  const d = await tmp(t); const worker = path.join(d, 'w.mjs'), done = path.join(d, 'done');
  // A worker that announces its drain and, on SIGTERM, takes a moment to finish the item in hand before leaving.
  await fs.writeFile(worker, `import fs from 'node:fs'; console.log('drained'); process.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(done)}, 'x'); process.exit(0); }, 300)); setInterval(() => {}, 1000);`);
  let spawned = 0; const { spawn } = await import('node:child_process');
  const sync = createSyncProcess({ paths: { home: d, projects: d, shadow: d, syncTmp: d, syncDir: d }, origin: 'https://x', workspace: 'ws', tokenFile: path.join(d, 't'), worker, restartMs: 50, spawn: (...a) => { spawned++; return spawn(...a); } });
  assert.equal(await sync.boot(), 'drained'); const started = Date.now(); await sync.settle(5000);
  assert.ok(Date.now() - started >= 250, 'waited for the item'); assert.equal(await fs.readFile(done, 'utf8'), 'x');
  await sleep(200); assert.equal(spawned, 1, 'no restart after a settle'); assert.equal(sync.running, false);
});
