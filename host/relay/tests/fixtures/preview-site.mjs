import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

/** A small stateful localhost site for remote Preview transport acceptance. */
export async function startPreviewSite(port = 0) {
  let saved = 'initial';
  const events = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'set-cookie': 'preview_csrf=fixture-token; SameSite=Lax; Path=/' });
      response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vibyra remote Preview fixture</title><h1>Remote Preview fixture</h1>
<a href="/page">Navigate</a><form action="/submit" method="post">
<input type="hidden" name="csrf" value="fixture-token"><input name="value" value="changed"><button>Save through backend</button></form>
<output id="state"></output><output id="live"></output>
<script>
fetch('/api/state').then(r => r.json()).then(s => state.textContent = s.value);
new EventSource('/events').onmessage = e => live.textContent = e.data;
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
ws.onopen = () => ws.send('hello'); ws.onmessage = e => document.body.dataset.ws = e.data;
</script>`);
    } else if (request.method === 'GET' && url.pathname === '/page') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<title>Second page</title><a href="/">Back</a><p id="saved">${escapeHtml(saved)}</p>`);
    } else if (request.method === 'GET' && url.pathname === '/api/state') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ value: saved, cookie: request.headers.cookie ?? '' }));
    } else if (request.method === 'POST' && url.pathname === '/submit') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) { response.writeHead(413).end(); return; }
      }
      const form = new URLSearchParams(body);
      if (!request.headers.cookie?.includes('preview_csrf=fixture-token') || form.get('csrf') !== 'fixture-token') {
        response.writeHead(403).end('CSRF check failed'); return;
      }
      saved = form.get('value') ?? '';
      response.writeHead(303, { location: '/page', 'set-cookie': [
        'preview_session=fixture; HttpOnly; SameSite=Lax; Path=/',
        'preview_preference=mobile; SameSite=Lax; Path=/',
      ] });
      response.end();
    } else if (request.method === 'GET' && url.pathname === '/redirect') {
      response.writeHead(302, { location: '/page' }).end();
    } else if (request.method === 'GET' && url.pathname === '/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      response.write('data: connected\n\n');
      events.add(response);
      request.on('close', () => events.delete(response));
    } else if (request.method === 'GET' && url.pathname === '/assets/large') {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 10 * 1024 * 1024 });
      const chunk = Buffer.alloc(16 * 1024, 0x5a);
      for (let sent = 0; sent < 10 * 1024 * 1024; sent += chunk.length) {
        if (!response.write(chunk)) await new Promise(resolve => response.once('drain', resolve));
      }
      response.end();
    } else {
      response.writeHead(404).end('Not found');
    }
  });
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on('connection', socket => socket.on('message', data => socket.send(`echo:${data}`)));
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, peer => sockets.emit('connection', peer, request));
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const actualPort = server.address().port;
  return {
    url: `http://127.0.0.1:${actualPort}/`,
    setValue(value) {
      saved = value;
      for (const response of events) response.write(`data: ${JSON.stringify(value)}\n\n`);
    },
    async close() {
      for (const response of events) response.end();
      for (const peer of sockets.clients) peer.terminate();
      await new Promise(resolve => sockets.close(resolve));
      await new Promise(resolve => server.close(resolve));
    },
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const selectedPort = Number(process.env.PORT ?? '0');
  if (!Number.isInteger(selectedPort) || selectedPort < 0 || selectedPort > 65535) throw new Error('Invalid PORT');
  const site = await startPreviewSite(selectedPort);
  process.stdout.write(`${site.url}\n`);
  process.on('SIGINT', async () => { await site.close(); process.exit(0); });
}
