import { createServer } from 'node:http';
import { attachRelay } from './relay.mjs';
import { tokenVerifier } from './registry.mjs';

const verify = tokenVerifier(JSON.parse(process.env.VIBYRA_RELAY_HOST_TOKENS ?? '{}'));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(req.url === '/health' ? 200 : 404);
  res.end(JSON.stringify({ ok: req.url === '/health' }));
});
const relay = attachRelay(server, verify);
server.listen(Number(process.env.PORT ?? 8788), process.env.BIND_ADDRESS ?? '127.0.0.1', () => {
  console.info('Vibyra opaque relay listening');
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  relay.close(); server.close();
});
