import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { until } from './ui-test-helpers.mjs';

const fixture = await mkdtemp(join(tmpdir(), 'vibyra-native-live-'));
await writeFile(join(fixture, 'README.md'), 'Isolated native conversation verification project.\n');
const binary = process.env.VIBYRA_HOST_BINARY ?? resolve('../host/target/debug/vibyra-host');
const child = spawn(binary, ['--name', 'Native Fixture Computer', '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', '127.0.0.1:0', '--pair'], { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', diagnostics = '', result, approved = false;
child.stdout.on('data', bytes => {
  output += bytes.toString();
  const key = output.match(/approve ([a-f0-9]{64})/)?.[1];
  if (key && !approved) { approved = true; child.stdin.write(`approve ${key}\n`); }
});
child.stderr.on('data', bytes => { diagnostics += bytes.toString(); });
let server;
try {
  const encoded = await until(() => output.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'isolated Host invitation');
  const address = await until(() => output.match(/listening on ([\d.:]+)/)?.[1], 'isolated Host listener');
  const pairing = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  pairing.url = `ws://${address}`;
  const manifest = await fetch('http://127.0.0.1:8081', { headers: { 'expo-platform': 'ios' } }).then(response => response.json());
  const bundle = new URL(manifest.launchAsset.url);
  bundle.pathname = '/tests/nativeLiveConversationFixture.tsx.bundle';
  manifest.launchAsset.url = bundle.toString();
  manifest.extra.expoGo.mainModuleName = 'tests/nativeLiveConversationFixture.tsx';
  manifest.extra.expoClient.name = 'Vibyra native live fixture';
  manifest.extra.scopeKey = '@anonymous/vibyra-native-live-fixture';
  const warm = await fetch(bundle);
  if (!warm.ok) throw new Error(await warm.text());
  await warm.arrayBuffer();
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/config') response.end(JSON.stringify({ invitation: JSON.stringify(pairing) }));
    else if (request.url === '/result') {
      let body = ''; for await (const chunk of request) body += chunk;
      result = JSON.parse(body); response.end('{}');
    } else {
      response.setHeader('content-type', 'application/expo+json');
      response.setHeader('expo-protocol-version', '0');
      response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
    }
  });
  await new Promise(resolve => server.listen(8093, '127.0.0.1', resolve));
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', 'exp://127.0.0.1:8093']);
  await until(() => result, 'native encrypted conversation result', 120000);
  await writeFile(join(fixture, 'native-result.json'), JSON.stringify(result, null, 2));
  await writeFile(join(fixture, 'host-diagnostics.txt'), diagnostics);
  console.log(`Native verification report: ${fixture}/native-result.json`);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.status, 'connected');
  assert.equal(result.control, 'ready');
  assert.equal(result.runner, 'conversation');
  assert.equal(result.turnState, 'completed');
  assert.match(result.messages.join('\n'), /Native iPhone conversation verified/);
  execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', '/tmp/vibyra-native-live-conversation.png']);
  console.log(`PASS real native RuntimeBridge → encrypted Host pairing/control → Codex turn → conversation renderer. Report: ${fixture}/native-result.json`);
} finally {
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'fixture Host shutdown', 5000).catch(() => child.kill('SIGKILL'));
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', 'exp://127.0.0.1:8081']);
}
