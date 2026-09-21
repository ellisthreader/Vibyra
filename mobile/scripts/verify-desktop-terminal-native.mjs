// Real iOS keyboard -> production phone screen -> encrypted Desktop backend -> PTY.
// Uses an isolated shell and manifest; never types into a user's live terminal.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { until } from './ui-test-helpers.mjs';

const udid = process.env.VIBYRA_SIMULATOR;
assert.ok(udid, 'Set VIBYRA_SIMULATOR to a dedicated booted test device UUID');
assert.notEqual(udid, 'CE6F7E36-B33A-4301-AFA4-5E7107F65AF6', 'Reserved manual sign-in device');
const idb = process.env.IDB_PATH ?? 'idb';
const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const fixture = await mkdtemp(join(tmpdir(), 'vibyra-desktop-terminal-native-'));
await writeFile(join(fixture, 'README.md'), 'Isolated iOS terminal acceptance.\n');
const probe = process.env.VIBYRA_TYPING_PROBE ?? resolve('../desktop-tauri/src-tauri/target/debug/examples/phone_typing_probe');
const child = spawn(probe, ['--project', fixture, '--state-dir', join(fixture, '.state')], { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', approved = false, session, keyboard = false;
function receive(bytes) {
  output += bytes.toString();
  const key = output.match(/Approve or deny device ([a-f0-9]{64})/)?.[1];
  if (key && !approved) { approved = true; child.stdin.write(`approve ${key}\n`); }
}
child.stdout.on('data', receive);
child.stderr.on('data', receive);
const sim = (...args) => execFileSync('xcrun', ['simctl', ...args]);
const ui = (...args) => execFileSync(idb, ['ui', ...args, '--udid', udid]);
const elements = () => JSON.parse(ui('describe-all').toString());
const tapLabel = label => {
  const available = elements();
  const item = available.find(item => item.AXLabel?.toLowerCase() === label.toLowerCase());
  assert.ok(item, `Native control ${label} is visible: ${available.map(item => item.AXLabel).join(', ')}`);
  const { x, y, width, height } = item.frame;
  ui('tap', String(Math.round(x + width / 2)), String(Math.round(y + height / 2)));
};
const launch = url => `vibyra://expo-development-client/?url=${encodeURIComponent(url)}`;
const shot = name => sim('io', udid, 'screenshot', join(fixture, `${name}.png`));
let server;
try {
  const encoded = await until(() => output.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'Desktop invitation');
  const address = await until(() => output.match(/listening on ([\d.:]+)/)?.[1], 'Desktop listener');
  const pairing = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  pairing.url = `ws://${address}`;
  child.stdin.write('typing on\n');
  const manifest = await fetch(metro, { headers: { 'expo-platform': 'ios' } }).then(r => r.json());
  const entry = 'tests/nativeTerminalFixture.tsx';
  const bundle = new URL(manifest.launchAsset.url);
  bundle.pathname = `/${entry}.bundle`;
  manifest.launchAsset.url = bundle.toString();
  manifest.extra.expoGo.mainModuleName = entry;
  manifest.extra.scopeKey = '@anonymous/vibyra-desktop-terminal-native';
  const warm = await fetch(bundle);
  assert.ok(warm.ok, await warm.text());
  server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/config') res.end(JSON.stringify({ invitation: JSON.stringify(pairing), existing: true }));
    else if (req.url === '/script') res.end(JSON.stringify({ keyboardInset: 0, commands: [
      "printf 'Desktop terminal: 100 columns, 30 rows\\nTap here to type from your iPhone.\\n'; stty size > before.txt",
      "alias phonecheck='touch typed; stty size > after.txt'; printf '\\033[30;1H'",
    ] }));
    else if (req.url === '/result') {
      let body = ''; for await (const chunk of req) body += chunk;
      const result = JSON.parse(body);
      if ('keyboard' in result) keyboard = result.keyboard;
      else session = result;
      res.end('{}');
    } else {
      res.setHeader('content-type', 'application/expo+json');
      res.setHeader('expo-protocol-version', '0');
      res.end(JSON.stringify(manifest));
    }
  });
  await new Promise(done => server.listen(8093, '127.0.0.1', done));
  sim('openurl', udid, launch('http://127.0.0.1:8093'));
  await until(() => session, 'native Desktop terminal', 90000);
  assert.equal(session.error, undefined, session.error);
  assert.equal(session.control, 'ready');
  shot('before-tap');
  ui('tap', '100', '220');
  await until(() => keyboard, 'Apple software keyboard after tapping terminal', 10000);
  if (elements().some(item => item.AXLabel === 'Continue')) tapLabel('Continue');
  await until(() => elements().some(item => item.AXLabel === 'p'), 'Apple keyboard letter keys', 10000);
  shot('keyboard');
  for (const letter of 'phonechecxx') tapLabel(letter);
  tapLabel('Delete'); tapLabel('Delete'); tapLabel('k');
  tapLabel('Send');
  await until(async () => (await readFile(join(fixture, 'typed'), 'utf8').catch(() => null)) === '', 'native typing executed by Desktop PTY');
  assert.equal(await readFile(join(fixture, 'before.txt'), 'utf8'), '30 100\n');
  assert.equal(await readFile(join(fixture, 'after.txt'), 'utf8'), '30 100\n', 'opening keyboard must preserve Desktop PTY grid');
  shot('typed');
  ui('tap', '100', '220');
  await until(() => !keyboard, 'second terminal tap dismisses keyboard', 10000);
  ui('tap', '100', '220');
  await until(() => keyboard, 'terminal tap reopens keyboard', 10000);
  child.stdin.write('typing off\n');
  await until(() => !keyboard, 'keyboard dismissed when Desktop revokes typing', 10000);
  shot('revoked');
  console.log(`PASS: native tap opens Apple keyboard, typing executes on Desktop, PTY stays 100x30, revocation dismisses keyboard.\nScreenshots: ${fixture}`);
} catch (error) {
  shot('failure');
  console.error(`Native failure screenshot: ${fixture}/failure.png`);
  throw error;
} finally {
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'probe shutdown', 5000).catch(() => child.kill('SIGKILL'));
  await new Promise(done => server ? server.close(done) : done());
  sim('openurl', udid, launch(metro));
}
