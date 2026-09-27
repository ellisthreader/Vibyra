import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { previewReadinessScript } from '../src/preview/readinessScript.ts';

const url = process.env.VIBYRA_PREVIEW_SITE_URL;
assert.ok(url?.startsWith('http://127.0.0.1:'), 'Set VIBYRA_PREVIEW_SITE_URL to the local website.');
const browser = process.env.VIBYRA_TEST_WEBKIT === '1' ? await webkit.launch({ headless: true })
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const navigations = [];
  const errors = [];
  const messages = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('reportPreviewReadiness', data => messages.push(JSON.parse(data)));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: data => window.reportPreviewReadiness(data) }; });
  await page.addInitScript(previewReadinessScript);
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(response.status(), 200);
  assert.equal((await response.text()).includes('MYSQL_ATTR_SSL_CA'), false);
  await page.waitForFunction(() => {
    const root = document.querySelector('#app, #root');
    return root && root.innerText.trim().length > 200;
  }, { timeout: 45000 });
  const drawn = Date.now() - started;
  await page.waitForTimeout(15000);
  assert.ok(messages.some(message => message.kind === 'ready'), 'production readiness observer saw a drawn app');
  assert.equal(messages.some(message => message.kind === 'failed'), false);
  assert.equal(navigations.length, 1, 'website did not repeatedly reload');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ outcome: 'drawn', drawnMs: drawn, documentRequests: navigations.length,
    warnings: 0, scriptErrors: errors.length, observationSeconds: 15 }));
} finally { await browser.close(); }
