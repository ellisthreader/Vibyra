// Runs the real terminal session screen on a booted iOS Simulator against an
// isolated Host, so the WebView terminal is exercised as a phone renders it.
// The screenshot is taken with a keyboard-sized inset applied, because that is
// where the terminal used to collapse to a few clipped rows. Fit and column
// count are asserted in verify-terminal.mjs, where the DOM can be measured.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { until } from './ui-test-helpers.mjs';

const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const entry = 'tests/nativeTerminalFixture.tsx';
// A phone keyboard covers roughly this much of the screen; 0 checks the idle layout.
const keyboardInset = Number(process.env.VIBYRA_KEYBOARD_INSET ?? 336);
const commands = ['ls -la', 'git status', 'git diff'];

const fixture = await mkdtemp(join(tmpdir(), 'vibyra-native-terminal-'));
await writeFile(join(fixture, 'README.md'), 'Isolated native terminal verification project.\n');
await writeFile(join(fixture, 'checkout.ts'), 'export const total = (items: number[]) => items.length;\n');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: fixture });
execFileSync('git', ['add', '.'], { cwd: fixture });
execFileSync('git', ['-c', 'user.name=Vibyra Test', '-c', 'user.email=test@localhost', 'commit', '-qm', 'Fixture'], { cwd: fixture });
await writeFile(join(fixture, 'checkout.ts'), 'export const total = (items: number[]) => items.length;\nexport const tax = (n: number) => n * 0.2;\n');

const binary = process.env.VIBYRA_HOST_BINARY ?? resolve('../host/target/debug/vibyra-host');
const child = spawn(binary, ['--name', 'Native Terminal Computer', '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', '127.0.0.1:0', '--pair'], { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', approved = false, result;
const approve = () => {
  const key = output.match(/Approve or deny device ([a-f0-9]{64})/)?.[1];
  if (key && !approved) { approved = true; child.stdin.write(`approve ${key}\n`); }
};
child.stdout.on('data', bytes => { output += bytes.toString(); approve(); });
child.stderr.on('data', bytes => { output += bytes.toString(); approve(); });

let server;
try {
  const encoded = await until(() => output.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'isolated Host invitation');
  const address = await until(() => output.match(/listening on ([\d.:]+)/)?.[1], 'isolated Host listener');
  const pairing = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  pairing.url = `ws://${address}`;
  const manifest = await fetch(metro, { headers: { 'expo-platform': 'ios' } }).then(response => response.json());
  const bundle = new URL(manifest.launchAsset.url);
  bundle.pathname = `/${entry}.bundle`;
  manifest.launchAsset.url = bundle.toString();
  manifest.extra.expoGo.mainModuleName = entry;
  manifest.extra.expoClient.name = 'Vibyra native terminal fixture';
  manifest.extra.scopeKey = '@anonymous/vibyra-native-terminal-fixture';
  const warm = await fetch(bundle);
  if (!warm.ok) throw new Error(await warm.text());
  await warm.arrayBuffer();
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/config') response.end(JSON.stringify({ invitation: JSON.stringify(pairing) }));
    else if (request.url === '/script') response.end(JSON.stringify({ commands, keyboardInset }));
    else if (request.url === '/result') {
      let body = ''; for await (const chunk of request) body += chunk;
      result = JSON.parse(body); response.end('{}');
    } else {
      response.setHeader('content-type', 'application/expo+json');
      response.setHeader('expo-protocol-version', '0');
      response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
    }
  });
  await new Promise(done => server.listen(8093, '127.0.0.1', done));
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', 'exp://127.0.0.1:8093']);
  await until(() => result, 'native terminal session', 120000);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.status, 'connected');
  assert.equal(result.control, 'ready', 'a session this phone opened starts with control');
  assert.equal(result.kind, 'shell');
  assert.equal(result.sessionStatus, 'running');
  assert.ok(result.output > 200, `the phone received only ${result.output} bytes of terminal output`);
  const shot = join(fixture, 'native-terminal.png');
  execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', shot], { stdio: 'ignore' });
  console.log(`PASS native terminal: live shell on a phone with a ${keyboardInset}px keyboard inset, ${result.output} bytes of output.`);
  console.log(`Screenshot: ${shot}`);
} finally {
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'fixture Host shutdown', 5000).catch(() => child.kill('SIGKILL'));
  await new Promise(done => server ? server.close(done) : done());
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', 'exp://127.0.0.1:8081']);
}
