// Runs INSIDE a real Fly Machine as root (see fly-vm-checks.sh). Exercises the real supervisor modules against a stub
// backend listening only on 127.0.0.1 (no internet backend involved). Prints PASS/FAIL/INFO lines, never secrets.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { runComputer } from '/opt/vibyra/src/computer.mjs';
import { PATHS } from '/opt/vibyra/src/computer-paths.mjs';
import { askProxy } from '/opt/vibyra/src/credential-helper.mjs';
import { ensureOwnedDir } from '/opt/vibyra/src/safe-dirs.mjs';
import { gracefulStop, EXPIRY_GRACE_MS, STOP_GRACE_MS } from '/opt/vibyra/src/graceful-stop.mjs';

const res = (v, id, d = '') => console.log(`${v} ${id} ${d}`);
const check = (ok, id, d) => res(ok ? 'PASS' : 'FAIL', id, d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const U = ['--reuid', '1001', '--regid', '1001', '--init-groups'];
const baseEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/data/home', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', GIT_SSL_CAINFO: '/tmp/stub-ca.pem' };
const run = (cmd, args, { env = baseEnv, cwd = '/', timeout = 20000 } = {}) => new Promise(resolve => {
  execFile('setpriv', [...U, 'env', '-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), cmd, ...args], { cwd, timeout }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});
const rootSh = cmd => execFileSync('sh', ['-c', cmd], { encoding: 'utf8' }).trim();

// ---- stub backend on 127.0.0.1:9911 (mimics GET git/credential) and stub "github.com" TLS on 127.0.0.1:443
const credLog = []; const authLog = [];
const stub = http.createServer((req, res2) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/projects/pending') return res2.end(JSON.stringify({ ok: true, projects: [] }));
  if (u.pathname === '/git/credential') {
    const q = Object.fromEntries(u.searchParams); credLog.push(q);
    if (q.op === 'push' && !(q.branch ?? '').startsWith('vibyra/')) { res2.statusCode = 403; return res2.end('{"ok":false}'); }
    return res2.end(JSON.stringify({ ok: true, username: 'x-access-token', password: 'STUB-TOKEN', expiresAt: new Date(Date.now() + 600000).toISOString() }));
  }
  res2.statusCode = 404; res2.end('{}');
});
await new Promise(r => stub.listen(9911, '127.0.0.1', r));
rootSh(`openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/stub-key.pem -out /tmp/stub-ca.pem -days 1 -subj /CN=github.com -addext subjectAltName=DNS:github.com 2>/dev/null; chmod 644 /tmp/stub-ca.pem; grep -q 'github.com' /etc/hosts || echo '127.0.0.1 github.com' >> /etc/hosts`);
const gh = https.createServer({ key: fs.readFileSync('/tmp/stub-key.pem'), cert: fs.readFileSync('/tmp/stub-ca.pem') }, (req, res2) => {
  if (req.headers.authorization) { authLog.push(req.url); res2.statusCode = 403; return res2.end('stub: authenticated, push not served'); }
  res2.statusCode = 401; res2.setHeader('WWW-Authenticate', 'Basic realm="stub"'); res2.end('auth');
});
await new Promise(r => gh.listen(443, '127.0.0.1', r));

// ---- (b) safe-dirs: stale root-visible symlink at a volume entry pointing at /etc
const etcBefore = rootSh('stat -c "%u:%g:%a" /etc; ls -la /etc | md5sum');
fs.rmSync('/data/projects', { recursive: true, force: true }); fs.symlinkSync('/etc', '/data/projects');
const planted = await run('ln', ['-s', '/etc', '/data/projects2']); // uid 1001 cannot plant at the /data level
check(planted.code !== 0 && !fs.existsSync('/data/projects2'), 'safe.1001_cannot_plant_in_data', `ln as uid1001 -> ${planted.stderr.trim()}`);
check(rootSh('stat -c %u:%a /data') .startsWith('0:'), 'safe.data_root_owned', rootSh('stat -c "%u:%a" /data'));
await ensureOwnedDir('/data/projects', '/data', { uid: 1001, gid: 1001 });
check(rootSh('stat -c "%u:%g:%a" /etc; ls -la /etc | md5sum') === etcBefore, 'safe.etc_untouched', `/etc owner/mode and listing identical (${rootSh('stat -c "%u:%g:%a" /etc')})`);
check(!fs.lstatSync('/data/projects').isSymbolicLink() && fs.lstatSync('/data/projects').uid === 1001, 'safe.symlink_replaced', 'now a real directory owned by 1001');
let refused = false; try { fs.mkdirSync('/data/open', { mode: 0o777 }); fs.chmodSync('/data/open', 0o777); fs.mkdirSync('/data/open/x'); await ensureOwnedDir('/data/open/x', '/data/open', { uid: 1001, gid: 1001 }); } catch (e) { refused = /parent is not a root-owned, closed/.test(e.message); }
check(refused, 'safe.unsafe_parent_refused', 'world-writable parent refused'); fs.rmSync('/data/open', { recursive: true, force: true });

// ---- real runComputer orchestration against the stub
const client = { token: 'RUNTIME-TOKEN-CANARY', call: async p => { const r = await fetch('http://127.0.0.1:9911' + p); if (!r.ok) { const e = Error('refused ' + r.status); e.status = r.status; throw e; } return r.json(); } };
const comp = await runComputer({ client, lease: { active: () => true }, scope: { workspace: 'w1' }, bootstrap: { name: 'fly-test' }, apiOrigin: 'https://example.invalid',
  heartbeat: async () => {}, isStopping: () => false, paths: { ...PATHS, hostBin: '/opt/test/fakehost.sh' } });
await sleep(1500);

// (f) credentials
const st = p => rootSh(`stat -c "%U:%G %a" ${p}`);
res('INFO', 'cred.perms', `run dir ${st('/run/vibyra')}, token ${st('/run/vibyra/runtime-token')}, socket ${st('/run/vibyra/git.sock')}`);
const rd = await run('cat', ['/run/vibyra/runtime-token']); check(rd.stdout === 'RUNTIME-TOKEN-CANARY', 'cred.token_readable_by_project_as_designed', 'uid1001 can read the token file (documented: Host needs it)');
const wr = await run('sh', ['-c', 'echo x >> /run/vibyra/runtime-token || exit 3']); check(wr.code !== 0, 'cred.token_not_writable', `uid1001 write exit ${wr.code}`);
const rm = await run('rm', ['-f', '/run/vibyra/runtime-token']); check(fs.existsSync('/run/vibyra/runtime-token'), 'cred.token_not_deletable', 'uid1001 rm did not remove it');
const ls1 = await run('sh', ['-c', 'echo evil > /run/vibyra/evil']); check(ls1.code !== 0, 'cred.run_dir_not_writable', 'uid1001 cannot create files in /run/vibyra');
const other = await new Promise(r => execFile('setpriv', ['--reuid', '65534', '--regid', '65534', '--clear-groups', 'cat', '/run/vibyra/runtime-token'], (e, o) => r({ code: e ? 1 : 0, o })));
check(other.code !== 0, 'cred.other_uid_cannot_read', 'uid 65534 (not in group 1001) cannot read token');
const procEnv = await run('cat', [`/proc/${process.pid}/environ`]); check(procEnv.code !== 0, 'cred.supervisor_environ_unreadable', 'uid1001 cannot read /proc/<supervisor>/environ (holds the canary secrets)');
const hostEnvTxt = fs.readFileSync('/tmp/project/host.env', 'utf8'); const keys = hostEnvTxt.split('\n').filter(Boolean).map(l => l.split('=')[0]).sort();
check(!/CANARY/.test(hostEnvTxt) && !/FLY_|BOOTSTRAP|LEASE|AWS_|ANTHROPIC/.test(hostEnvTxt), 'cred.host_env_clean', `Host env keys: ${keys.join(',')}`);
check(fs.readFileSync('/tmp/project/host.uid', 'utf8').trim() === '1001', 'cred.host_runs_as_1001', 'fake Host child uid 1001');
const hostPid = rootSh("pgrep -u 1001 -f 'sleep 3600' | head -1"); const penv = hostPid ? fs.readFileSync(`/proc/${hostPid}/environ`, 'utf8') : '';
check(hostPid && !/CANARY|FLY_|BOOTSTRAP|LEASE_/.test(penv), 'cred.host_proc_environ_clean', `live Host process ${hostPid} environ checked`);
const oom = fs.readFileSync('/proc/self/oom_score_adj', 'utf8').trim(); res('INFO', 'cred.oom_score_adj', `this (root harness) process ${oom}; main.mjs writes -1000 itself`);

// (c) real git push through the real helper + proxy
const repoSh = `set -e; rm -rf /data/projects/r; mkdir -p /data/projects/r; cd /data/projects/r; git init -q -b main; git config user.email a@b.c; git config user.name t;
echo 1 > f; git add f; git commit -qm one; git branch vibyra/a; git branch vibyra/b; git tag v1; git remote add origin https://github.com/owner/repo.git`;
const rs = await run('sh', ['-c', repoSh], { env: { ...baseEnv, GIT_CONFIG_NOSYSTEM: '' } }); check(rs.code === 0, 'push.setup', rs.stderr.trim().slice(0, 150));
const repo = '/data/projects/r';
async function push(args, label, expectAllowed, expectBranches) {
  const c0 = credLog.length, a0 = authLog.length; const r = await run('git', ['push', ...args], { cwd: repo });
  const pushCreds = credLog.slice(c0).filter(q => q.op === 'push').map(q => q.branch);
  const authed = authLog.length > a0;
  const ok = expectAllowed ? authed && expectBranches.every(b => pushCreds.includes(b)) : !authed && pushCreds.length === 0;
  check(ok, `push.${label}`, `git push ${args.join(' ')} => creds minted for [${pushCreds.join(',')}] authed=${authed} :: ${r.stderr.trim().split('\n').pop().slice(0, 110)}`);
}
await push(['origin', 'HEAD:refs/heads/vibyra/a'], 'allow_HEAD_to_vibyra_a', true, ['vibyra/a']);
await push(['origin', 'vibyra/b'], 'allow_branch_name', true, ['vibyra/b']);
await push(['origin', 'refs/heads/vibyra/a:refs/heads/vibyra/c'], 'allow_full_ref_rename', true, ['vibyra/c']);
await push(['origin', 'vibyra/a', 'vibyra/b'], 'allow_two_vibyra_refs', true, ['vibyra/a', 'vibyra/b']);
await push(['origin', 'main'], 'refuse_main', false);
await push(['origin', 'HEAD:main'], 'refuse_HEAD_to_main', false);
await push(['origin', 'vibyra/a:main'], 'refuse_vibyra_to_main', false);
await push(['origin', 'vibyra/a', 'main'], 'refuse_mixed_vibyra_and_main', false);
await push(['origin', 'HEAD:refs/heads/master'], 'refuse_master', false);
await push(['--all', 'origin'], 'refuse_all', false);
await push(['--mirror', 'origin'], 'refuse_mirror', false);
await push(['--tags', 'origin'], 'refuse_tags', false);
await push(['origin', 'v1'], 'refuse_tag_v1', false);
await push(['origin', ':vibyra/a'], 'refuse_delete_refspec', false);
await push(['--delete', 'origin', 'vibyra/a'], 'refuse_delete_flag', false);
await push(['origin'], 'refuse_bare_push_on_main_branch', false);
await push(['origin', 'vibyra/a:refs/heads/vibyra/../main'], 'refuse_dotdot', false);
const c1 = credLog.length; const lr = await run('git', ['ls-remote', 'origin'], { cwd: repo });
check(credLog.slice(c1).some(q => q.op === 'fetch' && q.repo === 'owner/repo') && authLog.length > 0, 'fetch.allowed', 'git ls-remote minted a fetch credential via the helper');
// forged pid / forged env
const fp = spawn('setpriv', [...U, 'env', '-i', 'PATH=/usr/bin:/bin', 'bash', '-c', 'exec -a git-credential-vibyra sleep 60'], { stdio: 'ignore' }); await sleep(500);
const pids = rootSh("pgrep -u 1001 -f 'git-credential-vibyra' | head -3").split('\n').map(Number).filter(Boolean);
const sockAsk = async (pid) => { const out = await run('node', ['-e', `import('/opt/vibyra/src/credential-helper.mjs').then(async m=>{try{console.log(JSON.stringify(await m.askProxy('/run/vibyra/git.sock',{repo:'owner/repo',op:'push',pid:${pid}})))}catch(e){console.log(JSON.stringify({err:String(e)}))}})`]); return out.stdout.trim(); };
const before = credLog.length;
const forged = await sockAsk(pids[0] ?? 99999), pid1 = await sockAsk(1), selfp = await sockAsk(process.pid), nopid = await run('node', ['-e', `import('/opt/vibyra/src/credential-helper.mjs').then(async m=>console.log(JSON.stringify(await m.askProxy('/run/vibyra/git.sock',{repo:'owner/repo',op:'push'}))))`]);
check(forged.includes('denied') && pid1.includes('denied') && selfp.includes('denied') && nopid.stdout.includes('denied') && credLog.length === before, 'push.forged_pid_refused', `fake-helper pid ${pids[0]}: ${forged}; pid1: ${pid1}; root pid: ${selfp}; no pid: ${nopid.stdout.trim()}; backend untouched`);
const envPush = await run('sh', ['-c', 'printf "protocol=https\\nhost=github.com\\npath=owner/repo.git\\n\\n" | VIBYRA_GIT_OP=push /opt/vibyra/bin/git-credential-vibyra get'], {}); 
check(envPush.stdout === '' && credLog.length === before, 'push.forged_env_op_refused', 'VIBYRA_GIT_OP=push helper without a git push ancestor returns nothing');
const fet = await run('sh', ['-c', 'printf "protocol=https\\nhost=github.com\\npath=owner/repo.git\\n\\n" | /opt/vibyra/bin/git-credential-vibyra get']);
check(/password=STUB-TOKEN/.test(fet.stdout) && !/RUNTIME-TOKEN/.test(fet.stdout), 'cred.helper_returns_only_username_password', 'helper output has username/password only, never the runtime token');
fp.kill('SIGKILL'); rootSh('pkill -KILL -u 1001 -f "sleep 60" || true');

// (d) graceful stop on real processes
fs.writeFileSync('/tmp/flusher.mjs', "import fs from 'node:fs';process.on('SIGTERM',()=>{fs.writeFileSync('/data/home/flushed','flushed '+Date.now());process.exit(0)});setInterval(()=>{},1000);");
fs.writeFileSync('/tmp/stubborn.sh', '#!/bin/sh\ntrap "" TERM\nwhile :; do sleep 1; done\n'); fs.chmodSync('/tmp/stubborn.sh', 0o755);
const spawn1001 = (cmd, args) => spawn('setpriv', [...U, 'env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', cmd, ...args], { stdio: 'ignore', detached: true }).unref();
const alive = () => { try { return execFileSync('pgrep', ['-c', '-u', '1001', '-f', 'flusher|stubborn|sleep 3600|setsid']).toString().trim(); } catch { return '0'; } };
fs.rmSync('/data/home/flushed', { force: true });
spawn1001('node', ['/tmp/flusher.mjs']); await sleep(800);
let t0 = Date.now(); await gracefulStop({ userUid: 1001, graceMs: STOP_GRACE_MS }); let dt = Date.now() - t0;
check(fs.existsSync('/data/home/flushed') && dt < 3000, 'stop.sigterm_flush', `SIGTERM handler flushed /data/home/flushed; stop returned in ${dt}ms (well inside ${STOP_GRACE_MS}ms grace)`);
fs.rmSync('/data/home/flushed', { force: true });
spawn1001('node', ['/tmp/flusher.mjs']); spawn1001('/tmp/stubborn.sh', []); spawn1001('setsid', ['nohup', '/tmp/stubborn.sh']); spawn1001('sh', ['-c', 'nohup sleep 3600 >/dev/null 2>&1 & exec sleep 3600']); await sleep(1000);
const n0 = alive(); t0 = Date.now();
await comp.shutdown({ graceMs: EXPIRY_GRACE_MS }); dt = Date.now() - t0; await sleep(300);
check(alive() === '0' && dt >= EXPIRY_GRACE_MS - 200 && dt <= EXPIRY_GRACE_MS + 3000, 'stop.expiry_kills_all_1001', `${n0} uid-1001 procs before (flusher, 2 SIGTERM-ignoring incl. setsid-daemonized, Host + children); all gone ${dt}ms after expiry (grace ${EXPIRY_GRACE_MS}ms, documented <=~8s); flusher flushed=${fs.existsSync('/data/home/flushed')}; leftover uid1001=${rootSh('pgrep -c -u 1001 || true')}`);
check(!fs.existsSync('/run/vibyra/runtime-token') && !fs.existsSync('/run/vibyra/git.sock'), 'stop.token_and_socket_removed', 'shutdown removed token file and git socket');
rootSh('sync; echo harness-done >/dev/null'); stub.close(); gh.close(); process.exit(0);
