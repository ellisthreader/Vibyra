import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { attachRelay } from './relay.mjs';
import { createReporter } from './presence.mjs';
import { bearerMatches, createVerifier } from './tokens.mjs';

// Vibyra Cloud relay. Computers connect outward to it and stay; phones connect
// to it and are paired with the computer they name. Every payload between the
// two is Noise-encrypted end to end, so this process forwards bytes it cannot
// read and reports only presence to the API. See host/docs/protocol.md.
export function startRelay(env = process.env, listen = true) {
  const secret = env.VIBYRA_RELAY_SECRET || undefined;
  const verify = createVerifier({ secret, staticHosts: JSON.parse(env.VIBYRA_RELAY_HOST_TOKENS ?? '{}') });
  const relayId = env.RAILWAY_REPLICA_ID || env.VIBYRA_RELAY_ID || hostname();
  const reporter = createReporter({ apiUrl: env.VIBYRA_API_URL, secret, relayId });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/health') return end(res, 200, { ok: true, relayId, hosts: relay.presence().length });
    if (!req.url?.startsWith('/admin/')) return end(res, 404, { ok: false });
    if (!bearerMatches(req.headers.authorization, secret)) return end(res, 401, { ok: false, error: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/admin/presence') return end(res, 200, { ok: true, hosts: relay.presence() });
    if (req.method === 'POST' && req.url === '/admin/disconnect') {
      return readJson(req).then(body => end(res, 200, { ok: true, disconnected: relay.disconnect(body) }))
        .catch(() => end(res, 400, { ok: false, error: 'Invalid request' }));
    }
    end(res, 404, { ok: false });
  });
  const relay = attachRelay(server, verify, { reporter });
  reporter.start();
  if (listen) {
    server.listen(Number(env.PORT ?? 8788), env.BIND_ADDRESS ?? '127.0.0.1', () => {
      console.info(`Vibyra relay ${relayId} listening${reporter.enabled ? ' and reporting presence' : ''}`);
    });
  }
  const close = () => { reporter.stop(); relay.close(); server.closeAllConnections?.(); server.close(); };
  return { server, relay, reporter, close };
}

function end(res, status, body) { res.writeHead(status); res.end(JSON.stringify(body)); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => { text += chunk; if (text.length > 4096) reject(new Error('Too large')); });
    req.on('end', () => { try { resolve(JSON.parse(text || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const running = startRelay();
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => running.close());
}
