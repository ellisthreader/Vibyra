// Plays the Fly VM supervisor for scripts/e2e-cloud-computer.sh using the REAL cloud-runtime computer-mode code
// (Client, Lease, runComputer, HostSupervisor, token file, git credential proxy, clone queue) against a local
// backend. Only two things differ from production: the control-plane origin is plain http on loopback (the real Client
// insists on https, so its base is re-pointed after construction), and paths live under E2E_DIR (uid switching is off).
import { Client } from '../cloud-runtime/src/client.mjs';
import { Lease } from '../cloud-runtime/src/lease.mjs';
import { runComputer } from '../cloud-runtime/src/computer.mjs';
import { PATHS } from '../cloud-runtime/src/computer-paths.mjs';
import path from 'node:path';

const need = name => process.env[name] || (() => { throw Error(`${name} is required`); })();
const api = need('E2E_API'), workspace = need('E2E_WORKSPACE'), dir = need('E2E_DIR');
const generation = Number(need('E2E_GENERATION')), machine = need('E2E_MACHINE');
const privateKey = Buffer.from(need('CLOUD_WORKSPACES_LEASE_PRIVATE_KEY'), 'base64');
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) throw Error('e2e supervisor only talks to a loopback backend');
const client = new Client('https://control.invalid', workspace, need('E2E_BOOTSTRAP'));
client.base = `${api}/api/cloud-runtime/${workspace}`;
const scope = { workspace, generation, machine };
const lease = new Lease(privateKey.subarray(32).toString('base64'), scope);
const bootstrap = await client.call('/bootstrap', { machineId: machine, generation });
if (bootstrap.mode !== 'computer') throw Error(`bootstrap mode was ${bootstrap.mode}`);
client.token = bootstrap.token;
let stopping = false;
const beat = async () => { const s = await client.call('/heartbeat', { ready: true }); if (s.stop) { console.log('[supervisor] backend asked to stop'); stopping = true; await computer.shutdown(); process.exit(0); } lease.accept(s.lease); };
const paths = { ...PATHS, run: path.join(dir, 'run'), socket: path.join(dir, 'run/git.sock'), tokenFile: path.join(dir, 'run/runtime-token'),
  home: path.join(dir, 'home'), hostState: path.join(dir, 'host'), projects: path.join(dir, 'projects'), hostBin: need('E2E_HOST_BIN'),
  gitconfig: '/dev/null', helper: path.resolve(import.meta.dirname, '../cloud-runtime/bin/git-credential-vibyra'),
  hooks: path.resolve(import.meta.dirname, '../cloud-runtime/hooks'),
  agentRuns: path.join(dir, 'agent-runs'), agentHome: path.join(dir, 'agent-home'), agentBin: null, browserBin: null, browserHome: path.join(dir, 'browser-home'),
  syncDir: path.join(dir, '.vibyra-sync'), shadow: path.join(dir, '.vibyra-shadow'), syncTmp: path.join(dir, '.vibyra-tmp') };
const computer = await runComputer({ client, lease, scope, bootstrap, apiOrigin: api, heartbeat: beat, isStopping: () => stopping, paths, uid: null, gid: null });
console.log('[supervisor] bootstrapped, host supervised; token file', paths.tokenFile);
process.on('SIGTERM', async () => { stopping = true; await computer.shutdown(); process.exit(0); });
await new Promise(() => {});
