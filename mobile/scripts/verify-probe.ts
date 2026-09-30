import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isConnectable, nearbyPairingLink } from '../src/connection/nearbyPairing';
import { probeIdentity } from '../src/connection/probeIdentity';
import { PROBE_PORTS } from '../src/connection/probeTargets';

// Proves the code the phone actually runs, against the Host it actually talks
// to: a discoverable Host is found on loopback — the address an iOS Simulator
// reaches its Mac on — and a private one is not.
const hostRoot = resolve('../host');
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'],
  { cwd: hostRoot }).toString());
const binary = join(metadata.target_directory, 'debug',
  process.platform === 'win32' ? 'vibyra-host.exe' : 'vibyra-host');

async function host(name: string, discover: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'vibyra-probe-'));
  writeFileSync(join(dir, 'hello.txt'), 'probe fixture\n');
  const args = ['--name', name, '--state-dir', join(dir, '.state'), '--project', dir,
    '--listen', '127.0.0.1:0'];
  if (discover) args.push('--discover');
  const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', bytes => { log += bytes.toString(); });
  child.stderr.on('data', bytes => { log += bytes.toString(); });
  const read = async (pattern: RegExp, label: string) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const match = log.match(pattern);
      if (match) return match[1];
      await new Promise(done => setTimeout(done, 25));
    }
    throw new Error(`Timed out waiting for ${label}: ${log}`);
  };
  const port = Number(await read(/listening on 127\.0\.0\.1:(\d+)/, 'listener'));
  const key = await read(/Host public key: ([a-f0-9]{64})/, 'identity');
  return { port, key, log: () => log, stop: () => { child.kill(); rmSync(dir, { recursive: true, force: true }); } };
}

async function main() {
  const open = new AbortController();
  const discoverable = await host('Probe Loopback Mac', true);
  const priv = await host('Private Mac', false);
  try {
    assert.match(discoverable.log(), /Not advertising over Bonjour/,
      'a loopback listener cannot advertise, and must say so instead of refusing to start');

    const found = await probeIdentity('127.0.0.1', discoverable.port, open.signal);
    assert.ok(found, 'a discoverable Host answers on loopback');
    assert.equal(found.hostId, discoverable.key, 'the identity is the Host static public key');
    assert.equal(found.name, 'Probe Loopback Mac');
    assert.equal(found.host, '127.0.0.1');
    assert.equal(found.port, discoverable.port);
    assert.ok(isConnectable(found), 'the result is ready to connect with no code');
    // Keyed by identity, so the same computer answering on another address or
    // port collapses into one card instead of a row of look-alikes.
    assert.equal(found.id, discoverable.key, 'one computer is one entry, whatever answered');
    const again = await probeIdentity('127.0.0.1', discoverable.port, open.signal);
    assert.equal(again?.id, found.id, 'a repeat answer is the same computer');
    // Nothing an address could leak into what a person reads.
    assert.doesNotMatch(found.name, /\d{1,3}(\.\d{1,3}){3}|:\d+/, 'a computer is never named by its address');
    const pairing = JSON.parse(nearbyPairingLink(found));
    assert.equal(pairing.url, `ws://127.0.0.1:${discoverable.port}`);
    assert.equal(pairing.publicKey, discoverable.key);
    assert.equal(pairing.invite, undefined);
    console.log(`PASS found: ${found.name} at ${found.host}:${found.port} with no code`);

    assert.equal(await probeIdentity('127.0.0.1', priv.port, open.signal), undefined,
      'a Host without --discover stays private');
    console.log('PASS private: a Host started without --discover is not discovered');

    // A silent address must fail fast, or a sweep would never finish.
    const started = Date.now();
    assert.equal(await probeIdentity('127.0.0.1', 1, open.signal), undefined);
    assert.ok(Date.now() - started < 1500, 'a closed port is given up on quickly');
    console.log('PASS quiet: a closed port answers nothing, quickly');
    console.log(`PASS ports: the sweep asks ${PROBE_PORTS.join(' and ')}`);
  } finally {
    discoverable.stop();
    priv.stop();
  }
}

void main();
