import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { until } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// Proves against a real Host, over the real encrypted transport, that a phone
// which has a computer stays with it. Reopening the app connects. A computer
// that restarts is picked back up on its own. Only the person's own Disconnect
// keeps it away, and that survives the next launch.
const hostRoot = resolve('../host');
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: hostRoot }));
const binary = join(metadata.target_directory, 'debug', process.platform === 'win32' ? 'vibyra-host.exe' : 'vibyra-host');
execFileSync('cargo', ['build', '-p', 'vibyra-host'], { cwd: hostRoot, stdio: 'inherit' });

const fixture = mkdtempSync(join(tmpdir(), 'vibyra-reconnect-'));
writeFileSync(join(fixture, 'hello.txt'), 'Reconnect fixture\n');
const port = await freePort();
let log = '';
let child;
/** The same computer every time: one address, one state directory, so a restart
 *  is the computer coming back rather than a different one appearing. */
function startHost(extra = []) {
  const started = spawn(binary, ['--name', 'Reconnect Test', '--state-dir', join(fixture, '.state'),
    '--project', fixture, '--listen', `127.0.0.1:${port}`, '--public-url', `ws://127.0.0.1:${port}`, ...extra],
  { stdio: ['pipe', 'pipe', 'pipe'] });
  started.stdout.on('data', bytes => { log += bytes.toString(); });
  started.stderr.on('data', bytes => { log += bytes.toString(); });
  return started;
}
async function freePort() {
  const probe = createServer();
  await new Promise(done => probe.listen(0, '127.0.0.1', done));
  const chosen = probe.address().port;
  await new Promise(done => probe.close(done));
  return chosen;
}

let browser, served;
try {
  child = startHost(['--pair']);
  await until(() => log.match(/listening on 127\.0\.0\.1:(\d+)/)?.[1], 'listener');
  const invitation = await until(() => log.match(/(vibyra:\/\/pair\?data=\S+)/)?.[1], 'pairing invitation');
  served = await serveFixture('tests/reconnectFixture.tsx');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  const status = async () => (await page.locator('body').innerText()).match(/STATUS (\w+)( RECONNECTING)?/)?.[1];
  const settled = (want, label, timeout) => until(async () => (await status()) === want, label, timeout);

  // Pairing once, by hand, exactly as a person does it.
  await page.goto(`${served.url}/?pair=${encodeURIComponent(invitation)}`);
  const device = await until(() => log.match(/Approve or deny device ([a-f0-9]{64})/)?.[1], 'approval request');
  child.stdin.write(`approve ${device}\n`);
  await settled('connected', 'the first pairing');
  console.log(`PASS paired: device ${device.slice(0, 12)}… connected after a local approval`);

  // 1. Reopening the app. Nothing on this page asks for a computer.
  const beforeRelaunch = log.length;
  await page.goto(served.url);
  await settled('connected', 'reopening the app', 15000);
  assert.doesNotMatch(log.slice(beforeRelaunch), /Approve or deny device/,
    'reopening the app must reuse trust, not ask to be paired again');
  console.log('PASS relaunch: the app opened straight onto the computer, with no code and no approval');

  // 2. The computer restarts underneath it, which is a real disconnection.
  child.kill();
  await until(async () => (await status()) !== 'connected', 'the computer going away');
  console.log(`PASS drop: the phone noticed the computer leave (${await status()})`);
  child = startHost();
  await until(() => log.match(/listening on 127\.0\.0\.1:\d+/g)?.length === 2, 'the computer coming back');
  await settled('connected', 'the restarted computer being picked back up', 40000);
  console.log('PASS recovery: the phone reconnected by itself once the computer was back');

  // 3. Put away by hand. This is the one reason to stay away, and it outlives
  //    the launch it was pressed in.
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await settled('offline', 'the disconnect');
  await page.goto(served.url);
  await new Promise(done => setTimeout(done, 4000));
  assert.equal(await status(), 'offline', 'a computer put away by hand must not reconnect on its own');
  console.log('PASS respected: Disconnect survived a relaunch, and nothing reconnected behind it');

  // 4. Asking for it back puts it back, and keeps it back.
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await settled('connected', 'the explicit reconnect');
  await page.goto(served.url);
  await settled('connected', 'the launch after an explicit reconnect', 15000);
  assert.deepEqual(errors, []);
  console.log('PASS restored: asking for the computer back re-armed the app for later launches');
} finally {
  await browser?.close();
  served?.close();
  child?.stdin.end();
  child?.kill();
  rmSync(fixture, { recursive: true, force: true });
}
