import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(execFileSync('cargo', ['+1.97.1', 'metadata', '--format-version', '1', '--no-deps'], { cwd: root }));
const binary = join(metadata.target_directory, 'debug', process.platform === 'win32' ? 'vibyra-host.exe' : 'vibyra-host');
const loader = readFileSync(join(root, 'generated/noise/vibyra_transport.js'));
const noise = await import(`data:text/javascript;base64,${loader.toString('base64')}`);
noise.initSync({ module: readFileSync(join(root, 'generated/noise/vibyra_transport_bg.wasm')) });
const temp = mkdtempSync(join(tmpdir(), 'vibyra-wasm-host-'));
writeFileSync(join(temp, 'hello.txt'), 'Private host project\n');
const child = spawn(binary, ['--state-dir', join(temp, '.state'), '--project', temp,
  '--listen', '127.0.0.1:0', '--public-url', 'ws://127.0.0.1:4318', '--pair'], { stdio: ['pipe', 'pipe', 'pipe'] });
let hostOutput = '';
let hostError = '';
child.stdout.on('data', bytes => { hostOutput += bytes.toString(); });
child.stderr.on('data', bytes => { hostError += bytes.toString(); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description, limit = 5000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { const value = check(); if (value) return value; await delay(10); }
  throw new Error(`Timed out: ${description}. Host stderr: ${hostError}`);
}
const sockets = [];
try {
  await until(() => hostOutput.includes('vibyra://pair?data='), 'host invitation');
  const uri = hostOutput.match(/vibyra:\/\/pair\?data=([\w-]+)/)[1];
  const pairing = JSON.parse(Buffer.from(uri, 'base64url').toString());
  const address = hostOutput.match(/listening on ([\d.:]+)/)[1];
  const keys = noise.generateKeypair();
  const deviceId = Buffer.from(keys.slice(32)).toString('hex');
  async function connect(invite) {
    const client = new noise.Client(keys.slice(0, 32), Buffer.from(pairing.publicKey, 'hex'));
    const socket = new WebSocket(`ws://${address}`);
    sockets.push(socket);
    socket.binaryType = 'arraybuffer';
    const queue = [];
    socket.addEventListener('message', event => queue.push(new Uint8Array(event.data)));
    await until(() => socket.readyState === WebSocket.OPEN, 'socket open');
    socket.send(client.start(new TextEncoder().encode(JSON.stringify({ protocol: 1, deviceName: 'WASM integration phone', ...(invite ? { invite } : {}) }))));
    if (invite) {
      await until(() => hostOutput.includes(`approve ${deviceId}`), 'local pairing approval prompt');
      child.stdin.write(`approve ${deviceId}\n`);
    }
    const handshake = await until(() => queue.shift(), 'Noise handshake');
    const authentication = JSON.parse(new TextDecoder().decode(client.finish(handshake)));
    assert.equal(authentication.ok, true);
    async function request(method, params = {}) {
      const id = randomUUID();
      socket.send(client.encrypt(new TextEncoder().encode(JSON.stringify({ id, method, params }))));
      const end = Date.now() + 7000;
      while (Date.now() < end) {
        const frame = await until(() => queue.shift(), `reply to ${method}`, 7000);
        const reply = JSON.parse(new TextDecoder().decode(client.decrypt(frame)));
        if (reply.id === id) {
          assert.equal(reply.ok, true, reply.error?.message);
          return reply.result;
        }
      }
      throw new Error(`Missing reply to ${method}`);
    }
    return { socket, client, request };
  }
  const first = await connect(pairing.invite);
  const state = await first.request('host.state');
  assert.equal(state.host.id, pairing.hostId);
  assert.equal(state.devices[0].id, deviceId);
  const projectId = state.projects[0].id;
  const file = await first.request('project.read', { projectId, path: 'hello.txt' });
  assert.equal(file.content, 'Private host project\n');
  const session = await first.request('session.create', { projectId, title: 'WASM terminal test', kind: 'shell', requestId: randomUUID() });
  const control = await first.request('session.claim', { sessionId: session.id });
  await first.request('session.input', { sessionId: session.id, ...control, inputId: randomUUID(), data: 'echo VIBYRA_WASM_COMPUTE_VERIFIED\r' });
  await delay(250);
  const snapshot = await first.request('session.snapshot', { sessionId: session.id });
  assert.match(snapshot.output, /VIBYRA_WASM_COMPUTE_VERIFIED/);
  first.socket.close();
  await until(() => first.socket.readyState === WebSocket.CLOSED, 'socket close');
  await delay(100);
  const second = await connect();
  const recovered = await second.request('session.snapshot', { sessionId: session.id });
  assert.equal(recovered.status, 'running');
  assert.match(recovered.output, /VIBYRA_WASM_COMPUTE_VERIFIED/);
  await second.request('session.stop', { sessionId: session.id });
  await second.request('device.revoke', { deviceId });
  await until(() => second.socket.readyState === WebSocket.CLOSED, 'revoked socket closure');
  console.log('PASS: WASM ↔ native Noise, local pairing approval, project read, real host PTY, reconnect snapshot, stop, revocation.');
} finally {
  for (const socket of sockets) socket.close();
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'host shutdown').catch(() => child.kill('SIGKILL'));
  rmSync(temp, { recursive: true, force: true });
}
