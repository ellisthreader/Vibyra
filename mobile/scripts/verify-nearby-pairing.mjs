import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { until } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// Proves the code-free path against a real Host: Bonjour supplies the identity,
// the phone connects with no invitation, and trust still comes only from an
// explicit local approval. The Host is started WITHOUT --pair, so no
// invitation exists at any point during this run.
// A unique instance name per run: mDNS caches records, so reusing one name can
// resolve the previous run's advertisement instead of this Host's.
const NAME = `Nearby Test ${randomBytes(4).toString('hex')}`;
const hostRoot = resolve('../host');
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: hostRoot }));
const binary = join(metadata.target_directory, 'debug', process.platform === 'win32' ? 'vibyra-host.exe' : 'vibyra-host');
const fixture = mkdtempSync(join(tmpdir(), 'vibyra-nearby-'));
writeFileSync(join(fixture, 'hello.txt'), 'Nearby pairing fixture\n');
const child = spawn(binary, ['--name', NAME, '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', '0.0.0.0:0', '--discover'], { stdio: ['pipe', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', bytes => { log += bytes.toString(); });
child.stderr.on('data', bytes => { log += bytes.toString(); });
let browser, servedFixture;
try {
  const key = await until(() => log.match(/Host public key: ([a-f0-9]{64})/)?.[1], 'host identity');
  const port = await until(() => log.match(/listening on [\d.]+:(\d+)/)?.[1], 'listener');
  const advertised = await resolveAdvertisement();
  if (advertised) {
    assert.equal(advertised.id, key, 'Bonjour advertises the Host static public key as its identity');
    assert.equal(advertised.invite, undefined, 'The advertisement carries no invitation');
    console.log(`PASS advertisement: ${NAME} announced id=${advertised.id.slice(0, 12)}… on port ${advertised.port}`);
  } else {
    console.log('SKIP advertisement: dns-sd unavailable; identity read from the Host log instead');
  }
  // The presence a build without Bonjour asks for directly. It must carry the
  // same identity the advertisement does, and nothing more.
  const presence = await fetch(`http://127.0.0.1:${port}/identity`);
  assert.equal(presence.status, 200, 'a discoverable Host answers its own address');
  const served = await presence.json();
  assert.equal(served.id, key, 'the served identity is the Host static public key');
  assert.equal(served.version, 1);
  assert.deepEqual(Object.keys(served).sort(), ['id', 'name', 'version'], 'presence only');
  console.log(`PASS presence: /identity served id=${served.id.slice(0, 12)}… for "${served.name}"`);

  // The real connecting screen receives the resolved record directly: setup
  // deliberately has no pairing-code form anymore.
  const computer = { id: key, hostId: key, name: NAME, host: '127.0.0.1', port: Number(port) };
  servedFixture = await serveFixture('tests/nearbyHostFixture.tsx');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark',
    isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(`${servedFixture.url}/?computer=${encodeURIComponent(JSON.stringify(computer))}`);
  await page.getByRole('heading', { name: 'Approve this iPhone' }).waitFor();
  const pending = await until(() => log.match(/Nearby pairing request from .*approve or deny device ([a-f0-9]{64})/i)?.[1]
    ?? log.match(/Nearby pairing request from [\s\S]*?device ([a-f0-9]{64})/)?.[1], 'nearby approval request');
  assert.doesNotMatch(log, /vibyra:\/\/pair\?data=/, 'No invitation was ever created for this run');
  assert.doesNotMatch(log, /invitation invalid, used, or expired/, 'The phone was not asked for a code');
  console.log(`PASS request: Host queued device ${pending.slice(0, 12)}… for local approval, with no code involved`);
  child.stdin.write(`approve ${pending}\n`);
  // The workspace names the computer only after host.state came back over the
  // authenticated channel, so this is the real connected signal.
  await page.getByText(`Connected to ${NAME}`, { exact: true }).waitFor().catch(async error => {
    console.error(log, await page.locator('body').innerText());
    throw error;
  });
  // Successful unmount must retain the live connection.
  assert.equal(await page.getByText('Connection disconnected', { exact: true }).count(), 0);
  console.log(`PASS connected: ${NAME} opened its workspace after the local approval`);
  // Enrollment is asserted on the Host itself rather than through app chrome.
  child.stdin.write('devices\n');
  await until(() => log.split(pending).length > 2, 'the phone listed as a trusted device');
  assert.deepEqual(errors, []);
  console.log(`PASS trusted: the Host now lists device ${pending.slice(0, 12)}… as enrolled`);
  const cancelledPage = await browser.newPage();
  const offset = log.length;
  await cancelledPage.goto(`${servedFixture.url}/?computer=${encodeURIComponent(JSON.stringify(computer))}`);
  const cancelled = await until(() => log.slice(offset).match(/Approve or deny device ([a-f0-9]{64})/)?.[1],
    'a second phone waiting for approval');
  await cancelledPage.getByRole('button', { name: 'Close connection fixture' }).click();
  await cancelledPage.getByText('Connection offline', { exact: true }).waitFor();
  // The socket must disappear from the Host queue, not just from the screen.
  // A late local decision must find no pending request. Check once so the test
  // cannot accidentally clear the queue itself and call that cancellation.
  await new Promise(resolve => setTimeout(resolve, 400));
  const from = log.length;
  child.stdin.write(`deny ${cancelled}\n`);
  await until(() => log.slice(from).includes('No pending pairing for this device'),
    'dismissal releases the Host approval queue', 3000);
  const devices = JSON.parse(readFileSync(join(fixture, '.state', 'identity.json'), 'utf8')).devices;
  assert.equal(devices[cancelled], undefined);
  assert.ok(devices[pending]);
  console.log('PASS dismissal: pending connection closes, queue clears, and no trust is granted');
} finally {
  await browser?.close();
  servedFixture?.close();
  child.stdin.end();
  child.kill();
  rmSync(fixture, { recursive: true, force: true });
}

/** Reads the real Bonjour record with Apple's own DNS-SD resolver, the same
 *  stack NWBrowser uses on the phone. Returns null where dns-sd is absent. */
async function resolveAdvertisement() {
  if (process.platform !== 'darwin') return null;
  let output = '';
  let resolver;
  try {
    resolver = spawn('dns-sd', ['-L', NAME, '_vibyra-host._tcp', 'local.']);
  } catch { return null; }
  resolver.stdout.on('data', bytes => { output += bytes.toString(); });
  resolver.on('error', () => { output = ''; });
  try {
    const record = await until(() => {
      const reached = output.match(/can be reached at \S+:(\d+)/);
      const id = output.match(/\bid=([a-f0-9]{64})\b/);
      return reached && id ? { port: Number(reached[1]), id: id[1],
        invite: output.match(/\binvite=(\S+)/)?.[1] } : null;
    }, 'bonjour record', 15000);
    return record;
  } catch {
    return null;
  } finally {
    resolver.kill();
  }
}
