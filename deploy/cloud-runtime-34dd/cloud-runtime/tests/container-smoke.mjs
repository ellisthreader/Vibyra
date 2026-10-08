// Run exclusively inside an ephemeral Linux container with NET_ADMIN.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.platform !== 'linux' || process.getuid() !== 0) throw Error('Ephemeral root Linux container required');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-control-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', directory + '/key.pem', '-out', directory + '/cert.pem'], { stdio: 'ignore' });
const keys = generateKeyPairSync('ed25519'); const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
let checkpoints = [], receipts = [], started = false;
const mode = process.argv[2] ?? 'stop';
const server = https.createServer({ key: await fs.readFile(directory + '/key.pem'), cert: await fs.readFile(directory + '/cert.pem') }, async (request, response) => {
  let raw = ''; for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {}; const route = request.url.replace('/api/cloud-runtime/workspace', '');
  const answer = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ok: true, ...data })); };
  const auth = request.headers.authorization;
  if (route === '/bootstrap') { assert.equal(auth, 'Bearer bootstrap-only'); assert.equal(body.machineId, 'machine');
    return answer({ token: 'runtime-only', project: { files: [] }, limits: { files: 100, fileBytes: 10000, projectBytes: 100000 } }); }
  assert.equal(auth, 'Bearer runtime-only');
  if (route === '/heartbeat') {
    if (started && mode === 'expire') { response.writeHead(503); response.end('{}'); return; }
    started = true;
    if (receipts.length >= 2 && mode === 'stop') return answer({ stop: true, state: 'stopping', lease: null });
    const payload = Buffer.from(JSON.stringify({ workspace: 'workspace', generation: 1, machine: 'machine', state: 'ready', expires: Math.floor(Date.now()/1000) + (mode === 'expire' ? 3 : 30) })).toString('base64');
    return answer({ stop: false, lease: { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString('base64') } });
  }
  if (route === '/checkpoint') { checkpoints.push(body.files); return answer({ checkpoint: 'verified', saved: true }); }
  if (route === '/actions/next') {
    const action = receipts.length === 0 ? { id: 'write-action', operation: 'write_file', arguments: { path: 'app.txt', content: 'cloud edit', expectedSha256: 'new' } }
      : receipts.length === 1 ? { id: 'run-action', operation: 'cloud_run_command', arguments: { command: `node -e "require('fs').writeFileSync('tested.txt','yes');console.log(process.env.VIBYRA_BOOTSTRAP || 'no secret')"` } } : null;
    return answer({ action: action ? { ...action, generation: 1, expiresAt: Math.floor(Date.now()/1000) + 120 } : null });
  }
  if (route.endsWith('/result')) { receipts.push(body.result); return answer({}); }
  response.writeHead(404); response.end('{}');
});
await new Promise(resolve => server.listen(8443, '127.0.0.1', resolve));
const child = spawn('/opt/vibyra/entrypoint.sh', [], { env: { PATH: process.env.PATH, NODE_EXTRA_CA_CERTS: directory + '/cert.pem',
  FLY_MACHINE_ID: 'machine', VIBYRA_WORKSPACE_ID: 'workspace', VIBYRA_GENERATION: '1', VIBYRA_BOOTSTRAP: 'bootstrap-only',
  VIBYRA_API_ORIGIN: 'https://127.0.0.1:8443', VIBYRA_LEASE_PUBLIC_KEY: publicKey }, stdio: 'inherit' });
const timer = setTimeout(() => { child.kill('SIGKILL'); }, 35000);
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer); server.close();
assert.equal(code, 0); assert.equal(receipts.length, 2); assert.equal(receipts[1].stdout.trim(), 'no secret');
assert.ok(checkpoints.at(-1).some(f => f.path === 'tested.txt'));
console.log(`Container smoke passed: ${mode}, real UID worker, API bootstrap, command, final independent checkpoint and shutdown.`);
