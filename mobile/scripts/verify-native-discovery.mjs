import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { until } from './ui-test-helpers.mjs';

// Read-only acceptance against the running Desktop. No fixture identity is
// approved or persisted, and Metro's entry stays intact.
const expected = await fetch('http://[::1]:4319/identity').then(r => r.json());
const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const manifest = await fetch(metro, {
  headers: { 'expo-platform': 'ios' },
}).then(r => r.json());
assert.equal(manifest.extra.expoClient.slug, 'vibyra', 'Metro must serve the maintained Vibyra app');
const entry = 'tests/nativeDiscoveryFixture.tsx';
const bundle = new URL(manifest.launchAsset.url);
bundle.pathname = `/${entry}.bundle`;
manifest.launchAsset.url = bundle.toString();
manifest.extra.expoGo.mainModuleName = entry;
manifest.extra.scopeKey = '@anonymous/vibyra-native-discovery-fixture';
manifest.extra.expoClient.name = 'Vibyra native discovery fixture';
const warm = await fetch(bundle);
if (!warm.ok) throw new Error(await warm.text());
await warm.arrayBuffer();
let result;
const server = createServer(async (request, response) => {
  if (request.url === '/result') {
    let body = ''; for await (const chunk of request) body += chunk;
    result = JSON.parse(body);
    response.setHeader('content-type', 'application/json'); response.end('{}');
  } else {
    response.setHeader('content-type', 'application/expo+json');
    response.setHeader('expo-protocol-version', '0');
    response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
  }
});
try {
  await new Promise(resolve => server.listen(8097, '127.0.0.1', resolve));
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', 'exp://127.0.0.1:8097']);
  await until(() => result, 'native phone discovers the running IPv6 Desktop', 55000);
  assert.equal(result.computer.hostId, expected.id);
  assert.equal(result.computer.name, expected.name);
  assert.equal(result.pairing.publicKey, expected.id);
  assert.equal(result.pairing.network, 'lan');
  assert.equal(result.pairing.nearby, true);
  await writeFile('/tmp/vibyra-native-discovery.json', JSON.stringify(result, null, 2));
  execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', '/tmp/vibyra-native-discovery.png']);
  console.log(`PASS native phone found ${result.computer.name}; real identity and usable LAN pairing.`);
} finally {
  await new Promise(resolve => server.close(resolve));
  execFileSync('xcrun', ['simctl', 'openurl', 'booted', metro.replace(/^http/, 'exp')]);
}
