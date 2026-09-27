import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { until } from './ui-test-helpers.mjs';

const simulator = process.env.VIBYRA_SIMULATOR;
assert.match(simulator ?? '', /^[a-f0-9-]{36}$/i, 'Set VIBYRA_SIMULATOR to the dedicated QA Simulator UUID');
const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const fixturePort = Number(process.env.VIBYRA_NATIVE_NEARBY_FIXTURE_PORT ?? 8099);
const hostPort = Number(process.env.VIBYRA_NATIVE_NEARBY_HOST_PORT ?? 4318);
assert.ok(Number.isInteger(fixturePort) && fixturePort > 1024 && fixturePort <= 65535);
assert.ok([4318, 4319].includes(hostPort), 'The bounded fallback checks Host ports 4318 and 4319');
const binary = process.env.VIBYRA_HOST_BINARY ?? resolve('../host/target/debug/vibyra-host');
const fixture = await mkdtemp(join(tmpdir(), 'vibyra-native-nearby-'));
const name = `Native QA ${randomBytes(4).toString('hex')}`;
await writeFile(join(fixture, 'README.md'), 'Temporary native nearby connection QA project.\n');
const child = spawn(binary, ['--name', name, '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', `0.0.0.0:${hostPort}`, '--discover'],
{ stdio: ['pipe', 'pipe', 'pipe'] });
let hostLog = '', result;
const events = [];
child.stdout.on('data', bytes => { hostLog += bytes.toString(); });
child.stderr.on('data', bytes => { hostLog += bytes.toString(); });
const launch = url => `vibyra://expo-development-client/?url=${encodeURIComponent(url)}`;
let server;
try {
  const hostId = await until(() => hostLog.match(/Host public key: ([a-f0-9]{64})/)?.[1],
    'temporary Host public key', 15000);
  await until(() => hostLog.includes(`listening on 0.0.0.0:${hostPort}`), 'temporary Host listener', 15000);
  const identity = await fetch(`http://127.0.0.1:${hostPort}/identity`).then(response => response.json());
  assert.equal(identity.id, hostId);
  assert.equal(identity.name, name);
  const manifest = await fetch(metro, { headers: { 'expo-platform': 'ios' } }).then(response => response.json());
  assert.equal(manifest.extra.expoClient.slug, 'vibyra');
  const entry = 'tests/nativeNearbyConnectionFixture.tsx';
  const bundle = new URL(manifest.launchAsset.url);
  bundle.pathname = `/${entry}.bundle`;
  manifest.launchAsset.url = bundle.toString();
  manifest.extra.expoGo.mainModuleName = entry;
  manifest.extra.scopeKey = '@anonymous/vibyra-native-nearby-connection';
  manifest.extra.expoClient.name = 'Vibyra native nearby QA';
  manifest.extra.expoClient.extra = { ...manifest.extra.expoClient.extra,
    nativeNearbyFixturePort: fixturePort };
  const warm = await fetch(bundle);
  if (!warm.ok) throw new Error(await warm.text());
  await warm.arrayBuffer();
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/config') return response.end(JSON.stringify({ hostId }));
    if (request.url === '/event' || request.url === '/result') {
      let body = ''; for await (const chunk of request) body += chunk;
      const value = JSON.parse(body);
      if (request.url === '/event') events.push(value);
      else result = value;
      return response.end('{}');
    }
    response.setHeader('content-type', 'application/expo+json');
    response.setHeader('expo-protocol-version', '0');
    response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
  });
  await new Promise(resolve => server.listen(fixturePort, '127.0.0.1', resolve));
  execFileSync('xcrun', ['simctl', 'openurl', simulator, launch(`http://127.0.0.1:${fixturePort}`)]);
  await until(() => events.find(event => event.stage === 'found') ?? result,
    'native iOS found the temporary Host', 60000);
  assert.equal(result?.error, undefined, result?.error);
  assert.equal(events.find(event => event.stage === 'found')?.hostId, hostId);
  const pending = await until(() => hostLog.match(/Nearby pairing request from [\s\S]*?approve or deny device ([a-f0-9]{64})/i)?.[1]
    ?? hostLog.match(/Nearby pairing request from [\s\S]*?device ([a-f0-9]{64})/)?.[1],
  'temporary Host nearby approval', 30000);
  assert.ok(events.some(event => event.stage === 'opening'));
  assert.doesNotMatch(hostLog, /vibyra:\/\/pair\?data=/, 'The Host created no invitation');
  child.stdin.write(`approve ${pending}\n`);
  await until(() => result, 'encrypted iOS host.state reply', 30000);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.stage, 'connected');
  assert.equal(result.protocol, 1);
  assert.equal(result.hostId, hostId);
  assert.equal(result.discoveredHostId, hostId);
  assert.equal(result.name, name);
  assert.equal(result.nearby, true);
  const report = { host: name, hostId, discovered: events.find(event => event.stage === 'found'),
    approvalRequested: true, connected: result.stage === 'connected', protocol: result.protocol };
  const reportPath = join(tmpdir(), 'vibyra-native-nearby-result.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`PASS native iOS Bonjour → Noise nearby approval → host.state; report ${reportPath}`);
} finally {
  child.stdin.end();
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null,
    'temporary Host shutdown', 5000).catch(() => child.kill('SIGKILL'));
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  execFileSync('xcrun', ['simctl', 'openurl', simulator, launch(metro)]);
  await rm(fixture, { recursive: true, force: true });
}
