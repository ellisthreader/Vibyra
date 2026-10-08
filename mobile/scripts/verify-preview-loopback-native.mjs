// Disposable Phase 0 proof. Targets a dedicated simulator, never the user's
// Vibyra iPhone 17 simulator or a physical phone.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const device = process.env.VIBYRA_PREVIEW_SIMULATOR;
const reserved = '258E794C-4AA5-4FA8-AE7D-8ACB070786D5';
assert.ok(device && device !== reserved, 'Set VIBYRA_PREVIEW_SIMULATOR to a separate booted simulator UUID.');
const proxyCase = process.env.VIBYRA_PREVIEW_CASE === 'proxy';
const noiseCase = process.env.VIBYRA_PREVIEW_CASE === 'noise';
const entry = noiseCase ? 'tests/previewNoiseNativeFixture.tsx'
  : proxyCase ? 'tests/previewProxyNativeFixture.tsx' : 'tests/previewLoopbackNativeFixture.tsx';
const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const manifest = await fetch(metro, { headers: { 'expo-platform': 'ios' } }).then(response => response.json());
const bundle = new URL(manifest.launchAsset.url);
bundle.pathname = `/${entry}.bundle`;
manifest.launchAsset.url = bundle.toString();
manifest.extra.expoGo.mainModuleName = entry;
manifest.extra.expoClient.name = 'Vibyra local Preview proof';
manifest.extra.scopeKey = '@anonymous/vibyra-preview-loopback-proof';
const warm = await fetch(bundle);
if (warm.status !== 200) throw new Error(`Fixture bundle failed: ${await warm.text()}`);
await warm.arrayBuffer();

let finish;
const result = new Promise((resolve, reject) => {
  finish = { resolve, reject };
  const timeout = noiseCase ? 180000 : 90000;
  const timer = setTimeout(() => reject(new Error(`Native Preview proof did not report within ${timeout / 1000} seconds.`)), timeout);
  timer.unref();
});
const server = createServer(async (request, response) => {
  if (noiseCase && request.url === '/config') {
    try {
      const config = await readFile('/private/tmp/vibyra-preview-live-config.json', 'utf8');
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(config);
    } catch (error) { response.writeHead(503).end(String(error)); }
    return;
  }
  if (request.url === '/result') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try { finish.resolve(JSON.parse(body)); } catch (error) { finish.reject(error); }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/expo+json', 'expo-protocol-version': '0' });
  response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
});
await new Promise(resolve => server.listen(8094, '127.0.0.1', resolve));
try {
  const fixtureUrl = encodeURIComponent('http://127.0.0.1:8094');
  execFileSync('xcrun', ['simctl', 'openurl', device, `exp+vibyra://expo-development-client/?url=${fixtureUrl}`]);
  const actual = await result;
  if (noiseCase) console.log(`Noise fixture result: ${JSON.stringify(actual)}`);
  assert.equal(actual.error, undefined, actual.error);
  for (const key of ['secure', 'cookie', 'sse', 'websocket', ...(noiseCase ? ['state'] : ['post'])]) {
    assert.equal(actual.checks?.[key], true, `${key}: ${JSON.stringify(actual)}`);
  }
  assert.equal(actual.checks.assetBytes, 10 * 1024 * 1024);
  assert.equal(actual.form, true, `real form navigation: ${JSON.stringify(actual)}`);
  assert.equal(actual.navigation, true, `link navigation: ${JSON.stringify(actual)}`);
  if (proxyCase || noiseCase) assert.equal(actual.isolation, true, `private loopback authentication: ${JSON.stringify(actual)}`);
  if (noiseCase) {
    assert.equal(actual.grant, true, `Mac grant: ${JSON.stringify(actual)}`);
    assert.equal(actual.rpcDuringAsset?.count, 10, `concurrent terminal RPC count: ${JSON.stringify(actual)}`);
    assert.ok(actual.rpcDuringAsset.during > 0, `terminal RPC overlapped asset: ${JSON.stringify(actual)}`);
    assert.equal(actual.rpcDuringAsset.sessionCount, 1, `Mac terminal session: ${JSON.stringify(actual)}`);
    assert.ok(actual.rpcDuringAsset.maxMs < 5000, `terminal RPC latency: ${JSON.stringify(actual)}`);
  }
  console.log(`PASS native ${noiseCase ? 'Mac Noise Preview' : proxyCase ? 'event-driven Preview proxy' : 'loopback'} WKWebView on simulator ${device}: ${(proxyCase || noiseCase) ? 'private origin, ' : ''}secure context, cookie, POST, SSE, WebSocket echo, 10 MB asset, real form and link navigation.`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
