// Dedicated manifest for an isolated Agent Computer backend.
// It reuses the current Metro bundle while routing app API calls to a fixture.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const api = process.env.VIBYRA_AGENT_QA_API_URL;
const port = Number(process.env.VIBYRA_AGENT_QA_MANIFEST_PORT ?? '8094');
const metro = process.env.VIBYRA_AGENT_QA_METRO_URL ?? 'http://127.0.0.1:8081';
const bind = process.env.VIBYRA_AGENT_QA_BIND ?? '127.0.0.1';
const fixtureHost = process.env.VIBYRA_AGENT_QA_FIXTURE_HOST;
const fixtureUrlHost = fixtureHost?.includes(':') ? `[${fixtureHost}]` : fixtureHost;
const apiUrl = new URL(api ?? 'http://invalid');
assert.equal(apiUrl.protocol, 'http:');
assert.ok(apiUrl.port && !apiUrl.username && !apiUrl.password && apiUrl.pathname === '/',
  'Set VIBYRA_AGENT_QA_API_URL to the isolated fixture backend');
assert.ok(fixtureHost ? apiUrl.hostname === fixtureUrlHost
  : ['127.0.0.1', 'localhost'].includes(apiUrl.hostname),
  'Use the selected fixture host');
assert.equal(bind, fixtureHost ?? '127.0.0.1', 'Bind only to the selected fixture host');
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536, 'Choose a valid manifest port');

const server = createServer(async (_request, response) => {
  try {
    const upstream = await fetch(metro, { headers: { 'expo-platform': 'ios' } });
    if (!upstream.ok) throw new Error(`Metro manifest: ${upstream.status}`);
    const manifest = await upstream.json();
    if (!manifest.launchAsset?.url || !manifest.extra?.expoClient?.extra)
      throw new Error('Metro returned an incomplete iOS manifest');
    manifest.id = randomUUID();
    manifest.createdAt = new Date().toISOString();
    manifest.extra.scopeKey = '@anonymous/vibyra-agent-computer-qa';
    manifest.extra.expoClient.name = 'Vibyra Agent Computer QA';
    manifest.extra.expoClient.extra.apiUrl = api;
    response.writeHead(200, { 'content-type': 'application/expo+json',
      'expo-protocol-version': '0', 'cache-control': 'no-store' });
    response.end(JSON.stringify(manifest));
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end(error instanceof Error ? error.message : 'Manifest unavailable');
  }
});

server.listen(port, bind, () => {
  console.log(`Agent Computer QA manifest: exp://${fixtureUrlHost ?? bind}:${port}`);
  console.log(`Fixture API: ${api}`);
});
