// Local fake provider for native browser acceptance, never production.
// Run alongside serve-native-conversation.mjs with VIBYRA_FIXTURE_ENTRY=tests/nativeIntegrationsFixture.tsx.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/integrations/catalogue.ts'], bundle: true, write: false, format: 'esm' });
const { fallbackIntegrations } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const flows = new Map();
const connected = new Set();
const catalogue = () => ({ enabled: true, integrations: fallbackIntegrations.map(entry => ({ ...entry,
  credential: { ...entry.credential, kind: 'oauth' }, installed: connected.has(entry.id),
  account: connected.has(entry.id) ? `${entry.name} test account` : null })) });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8106');
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname.startsWith('/api/') && req.headers.authorization !== 'Bearer fixture-guest') return json({ error: 'Wrong fixture guest' }, 401);
  if (url.pathname === '/api/connectors') return json(catalogue());
  const start = url.pathname.match(/^\/api\/connectors\/(github|stripe|figma)\/start$/);
  if (start) {
    let body = ''; for await (const chunk of req) body += chunk;
    const returnUrl = JSON.parse(body).returnUrl;
    const id = randomUUID(); flows.set(id, { slug: start[1], returnUrl, status: 'pending' });
    console.log(`Started ${start[1]} native guest flow; return: ${returnUrl}`);
    return json({ flowId: id, url: `http://127.0.0.1:8106/authorize?flow=${id}` });
  }
  const poll = url.pathname.match(/^\/api\/connectors\/flows\/([^/]+)$/);
  if (poll) return json({ status: flows.get(poll[1])?.status ?? 'expired', catalogue: catalogue() });
  const disconnect = url.pathname.match(/^\/api\/connectors\/(github|stripe|figma)\/disconnect$/);
  if (disconnect) { connected.delete(disconnect[1]); return json(catalogue()); }
  const id = url.searchParams.get('flow'); const flow = flows.get(id);
  if (!flow) return json({ error: 'Unknown fixture flow' }, 404);
  if (url.pathname === '/authorize') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test provider approval</title>
      <body style="font:18px system-ui;padding:30px;background:#101115;color:white"><h1>${flow.slug} test authorization</h1>
      <p>This tests the iOS browser round trip. No real account or provider access.</p>
      <p><a style="color:#8ab4ff" href="/callback?flow=${id}">Approve test connection</a></p>
      <p><a style="color:#8ab4ff" href="/callback?flow=${id}&cancel=1">Decline test connection</a></p></body>`);
  }
  if (url.pathname === '/callback') {
    flow.status = url.searchParams.has('cancel') ? 'failed' : 'connected';
    if (flow.status === 'connected') connected.add(flow.slug);
    console.log(`Finished ${flow.slug}: ${flow.status}`);
    res.writeHead(302, { Location: flow.returnUrl }); return res.end();
  }
  json({ error: 'Unknown fixture route' }, 404);
});
server.listen(8106, '127.0.0.1', () => console.log('Native integration test provider: http://127.0.0.1:8106'));
