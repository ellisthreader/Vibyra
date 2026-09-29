import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../mobile/node_modules/playwright-core/index.mjs';

const root = resolve(import.meta.dirname, '..'), publicRoot = resolve(root, 'public');
let pages;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost'), path = url.pathname;
  if (path === '/untrusted.js') { response.setHeader('Content-Type', 'text/javascript'); response.end('window.untrustedSourceRan=true'); return; }
  if (pages?.[path]) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Security-Policy', pages[path].csp);
    const attack = '<script src="/untrusted.js"></script><script>window.untrustedRan=true</script><button id="injected-handler" onclick="window.untrustedEventRan=true">Injected</button>';
    const html = url.searchParams.has('attack') ? pages[path].html.replace('</body>', attack + '</body>') : pages[path].html;
    response.end(html); return;
  }
  if (path.startsWith('/api/') || path.startsWith('/web-api/')) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true, user: null, session: null, plans: [], providers: [], choice: 'unknown', can_link: false })); return;
  }
  const file = resolve(publicRoot, `.${path}`);
  if (!file.startsWith(publicRoot + '/')) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
pages = JSON.parse(execFileSync('php', ['scripts/website-csp-fixture.php', origin], { cwd: root, encoding: 'utf8',
  env: { ...process.env, APP_ENV: 'testing', APP_KEY: `base64:${Buffer.alloc(32, 7).toString('base64')}`,
    DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:', DB_URL: '', SESSION_DRIVER: 'array', CACHE_STORE: 'array' } }));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.violatedDirective));
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Decline', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
  await page.goto(`${origin}/login`);
  await page.waitForFunction(() => document.getElementById('portal-root')?.textContent.length > 100);
  assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
  await page.goto(`${origin}/legal/privacy`);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(244, 245, 247)');
  assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
  await page.goto(`${origin}/legal/privacy?attack=1`);
  await page.locator('#injected-handler').click();
  assert.equal(await page.evaluate(() => window.untrustedRan || window.untrustedEventRan || window.untrustedSourceRan), undefined);
  await page.goto(`${origin}/remote/verify`);
  await page.getByText('Open verification in a browser that supports passkeys.').waitFor();
  assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
  assert.deepEqual(errors, []);
  console.log('Website CSP: marketing/analytics, portal, legal style, passkey script render; injected scripts and handlers blocked.');
} finally { await browser.close(); server.close(); }
