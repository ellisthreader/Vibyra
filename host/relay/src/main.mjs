import { createAllowance } from './allowance.mjs';
import { createAuthorization } from './authorization.mjs';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { attachRelay } from './relay.mjs';
import { createReporter } from './presence.mjs';
import { bearerMatches, createVerifier } from './tokens.mjs';
import { NATIVE_ORIGINS } from './upgradePolicy.mjs';

// Vibyra Cloud relay. Computers connect outward to it and stay; phones connect
// to it and are paired with the computer they name. Every payload between the
// two is Noise-encrypted end to end, so this process forwards bytes it cannot
// read and reports only presence to the API. See host/docs/protocol.md.
export function startRelay(env = process.env, listen = true, options = {}) {
  if (Number(env.RAILWAY_REPLICA_COUNT ?? env.VIBYRA_RELAY_REPLICAS ?? 1) !== 1) throw new Error('Relay requires exactly one replica until host routing is implemented');
  const secret = env.VIBYRA_RELAY_SIGNING_SECRET || env.VIBYRA_RELAY_SECRET || undefined;
  const adminSecret = env.VIBYRA_RELAY_ADMIN_SECRET || env.VIBYRA_RELAY_SECRET;
  const reportSecret = env.VIBYRA_RELAY_REPORT_SECRET || env.VIBYRA_RELAY_SECRET;
  const authorization = Object.hasOwn(options, 'authorization') ? options.authorization : createAuthorization({ apiUrl: env.VIBYRA_API_URL, secret: reportSecret });
  const verify = createVerifier({ secret, staticHosts: JSON.parse(env.VIBYRA_RELAY_HOST_TOKENS ?? '{}'), signingKeyId: env.VIBYRA_RELAY_SIGNING_KEY_ID,
    signingPreviousSecret: env.VIBYRA_RELAY_SIGNING_PREVIOUS_SECRET, signingPreviousUntil: Number(env.VIBYRA_RELAY_SIGNING_PREVIOUS_UNTIL),
    signingPreviousKeyId: env.VIBYRA_RELAY_SIGNING_PREVIOUS_KEY_ID });
  const relayId = env.RAILWAY_REPLICA_ID || env.VIBYRA_RELAY_ID || hostname();
  const allowance = options.allowance ?? createAllowance({ bytesPerSecond: positive(env.VIBYRA_RELAY_ACCOUNT_BYTES_PER_SECOND),
    slowedBytesPerSecond: positive(env.VIBYRA_RELAY_SLOWED_BYTES_PER_SECOND) });
  const reporter = createReporter({ apiUrl: env.VIBYRA_API_URL, secret: reportSecret, relayId,
    usage: () => allowance.drain(), onReply: body => allowance.setSlowed(body?.slowed) });
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/health') return end(res, 200, { ok: true, relayId, hosts: relay.presence().length });
    if (!req.url?.startsWith('/admin/')) return end(res, 404, { ok: false });
    if (!bearerMatches(req.headers.authorization, adminSecret)) return end(res, 401, { ok: false, error: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/admin/diagnostics') return end(res, 200, { ok: true, version: env.VIBYRA_RELAY_VERSION ?? 'unknown', relay: relay.diagnostics(), authorization: authorization?.metrics ?? null, presence: reporter.diagnostics(), runtime: runtimeDiagnostics(loopDelay) });
    if (req.method === 'GET' && req.url === '/admin/presence') return end(res, 200, { ok: true, hosts: relay.presence() });
    if (req.method === 'POST' && req.url === '/admin/disconnect') {
      return readJson(req).then(body => end(res, 200, { ok: true, disconnected: relay.disconnect(body), generation: body.generation, grantId: body.grantId }))
        .catch(() => end(res, 400, { ok: false, error: 'Invalid request' }));
    }
    end(res, 404, { ok: false });
  });
  const relay = attachRelay(server, verify, { reporter, authorization, allowance, previewPacingMs: Number(env.VIBYRA_RELAY_PREVIEW_PACING_MS ?? 3),
    upgrade: { path: env.VIBYRA_RELAY_WEBSOCKET_PATH ?? '/', origins: env.VIBYRA_RELAY_ALLOWED_ORIGINS === undefined ? NATIVE_ORIGINS : JSON.parse(env.VIBYRA_RELAY_ALLOWED_ORIGINS) } });
  reporter.start();
  if (listen) {
    server.listen(Number(env.PORT ?? 8788), env.BIND_ADDRESS ?? '127.0.0.1', () => {
      console.info(`Vibyra relay ${relayId} listening${reporter.enabled ? ' and reporting presence' : ''}`);
    });
  }
  const close = () => { loopDelay.disable(); reporter.stop(); authorization?.close(); relay.close(); server.closeAllConnections?.(); server.close(); };
  return { server, relay, reporter, close };
}

function runtimeDiagnostics(delay) {
  const memory = process.memoryUsage();
  return { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
    eventLoopDelayP95Ms: delay.count ? delay.percentile(95) / 1e6 : 0,
    eventLoopDelayMaxMs: delay.count ? delay.max / 1e6 : 0 };
}

function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : undefined; }

function end(res, status, body) { res.writeHead(status); res.end(JSON.stringify(body)); }
export function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0; let done = false;
    const timer = setTimeout(() => finish(new Error('Request timed out')), 5000);
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', fail);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const data = chunk => {
      bytes += chunk.length;
      if (bytes > 4096) return finish(new Error('Too large'));
      chunks.push(chunk);
    };
    const end = () => { try { finish(null, JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (error) { finish(error); } };
    const fail = error => finish(error);
    req.on('data', data); req.on('end', end); req.on('error', fail);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const running = startRelay();
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => running.close());
}
