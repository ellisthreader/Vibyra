import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const { WebSocketServer } = createRequire(new URL('../../host/relay/package.json', import.meta.url))('ws');
const fixture = await serveFixture('tests/runtimeOriginFixture.tsx');
const server = createServer();
const sockets = new WebSocketServer({ server });
let observedOrigin;
sockets.on('connection', (socket, request) => { observedOrigin = request.headers.origin; socket.on('error', () => {}); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture.url);
  await page.waitForFunction(() => window.runtimeNotices.some(notice => notice.type === 'ready'));
  const element = page.locator('iframe');
  assert.equal(await element.getAttribute('sandbox'), null);
  assert.equal(await element.getAttribute('srcdoc'), null);
  const frame = page.frames().find(item => item.url().endsWith('/__vibyra/transport.html'));
  assert.ok(frame);
  const policy = await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(policy, /script-src 'sha256-/); assert.doesNotMatch(policy, /unsafe-inline/);
  await frame.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.unsafeExecuted=true'; document.body.appendChild(script);
    const data = JSON.stringify({ target: 'vibyra-runtime', type: 'keygen' });
    window.dispatchEvent(new MessageEvent('message', { source: parent, origin: 'https://attacker.test', data }));
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data }));
  });
  assert.equal(await frame.evaluate(() => window.unsafeExecuted), undefined);
  await page.evaluate(() => window.runtimePost({ target: 'vibyra-runtime', type: 'keygen' }));
  await page.waitForFunction(() => window.runtimeNotices.some(notice => notice.type === 'keypair'));
  const keypair = await page.evaluate(() => window.runtimeNotices.filter(notice => notice.type === 'keypair'));
  assert.equal(keypair.length, 1); assert.match(keypair[0].key, /^[a-f0-9]{64}$/);
  const port = server.address().port;
  await page.evaluate(({ key, port }) => window.runtimePost({ target: 'vibyra-runtime', type: 'open', connectionId: 'origin-test',
    privateKey: key, deviceName: 'Browser fixture', pairing: { publicKey: 'ab'.repeat(32), url: `ws://127.0.0.1:${port}` } }), { key: keypair[0].key, port });
  await page.waitForFunction(() => window.runtimeNotices.some(notice => notice.type === 'transport-open'));
  assert.equal(observedOrigin, fixture.url);
  await page.evaluate(() => window.runtimePost({ target: 'vibyra-runtime', type: 'close' }));
  assert.deepEqual(errors, []);
  console.log('Real WASM, exact WebSocket Origin, pinned parent messages and CSP script hash passed.');
} finally {
  await browser.close(); for (const socket of sockets.clients) socket.terminate();
  sockets.close(); server.close(); fixture.close();
}
