// Isolated Expo manifest for a native fixture. Main app entry and Metro stay unchanged.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081';
const port = Number(process.env.VIBYRA_FIXTURE_PORT ?? 8092);
const response = await fetch(metro, { headers: { 'expo-platform': 'ios' } });
if (!response.ok) throw new Error(`Metro manifest returned ${response.status}`);
const manifest = await response.json();
const entry = process.env.VIBYRA_FIXTURE_ENTRY ?? 'tests/nativeConversationFixture.tsx';
const bundle = new URL(manifest.launchAsset.url);
bundle.pathname = `/${entry}.bundle`;
manifest.launchAsset.url = bundle.toString();
manifest.extra.expoGo.mainModuleName = entry;
manifest.id = '74de0618-df49-4f31-a900-4a5bad84d042';
manifest.extra.scopeKey = '@anonymous/vibyra-conversation-fixture';
manifest.extra.expoClient.name = 'Vibyra conversation fixture';
const warm = await fetch(bundle);
if (!warm.ok) throw new Error(`Native fixture bundle failed: ${await warm.text()}`);
await warm.arrayBuffer();
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/expo+json');
  res.setHeader('expo-protocol-version', '0');
  res.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
});
server.listen(port, '127.0.0.1', () => console.log(`Native fixture: exp://127.0.0.1:${port}`));
process.on('SIGTERM', () => server.close());
