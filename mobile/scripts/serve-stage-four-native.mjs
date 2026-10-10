import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const port = 8202, metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8201';
const output = resolve('../output/agent-stage4-20261008/simulator');
mkdirSync(output, { recursive: true });
const response = await fetch(metro, { headers: { 'expo-platform': 'ios' } });
if (!response.ok) throw new Error(`Manifest ${response.status}`);
const manifest = await response.json(), entry = 'tests/nativeStageFourFixture.tsx';
const bundle = new URL(manifest.launchAsset.url); bundle.pathname = `/${entry}.bundle`;
manifest.launchAsset.url = bundle.toString(); manifest.extra.expoGo.mainModuleName = entry;
manifest.extra.scopeKey = '@anonymous/vibyra-stage-four-qa'; manifest.extra.expoClient.name = 'Stage 4 Native QA';
const warm = await fetch(bundle); if (!warm.ok) throw new Error(await warm.text()); await warm.arrayBuffer();
createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/evidence') {
    let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on('end', () => { try { const event = JSON.parse(body); appendFileSync(resolve(output, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n'); res.end('ok'); } catch { res.writeHead(400); res.end(); } });
    return;
  }
  res.setHeader('content-type', 'application/expo+json'); res.setHeader('expo-protocol-version', '0'); res.end(JSON.stringify(manifest));
}).listen(port, '127.0.0.1', () => console.log(`Stage4 fixture ready at http://127.0.0.1:${port}`));
