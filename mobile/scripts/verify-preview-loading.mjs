import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/previewLoadingFixture.tsx', {
  'react-native-webview': './tests/previewWebViewMock.tsx',
});
const output = new URL('../../output/preview-loading/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
let browser;
try {
  browser = process.env.VIBYRA_TEST_WEBKIT === '1' ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: process.env.CHROME_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(url);
  await page.getByText('Opening your website', { exact: true }).waitFor();
  await page.screenshot({ path: output + 'loading-dark.png' });
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.previewLoading.rerender());
  assert.deepEqual(await page.evaluate(() => window.previewLoading.stats()), { mounts: 1, unmounts: 0, sources: 1 });
  await page.evaluate(() => { window.previewLoading.begin(); window.previewLoading.ready(); });
  await page.getByTestId('preview-status').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.previewLoading.http(404, 'favicon.ico'));
  assert.equal(await page.getByTestId('preview-status').count(), 0, 'asset errors must not cover a rendered site');
  await page.evaluate(() => window.previewLoading.http(500));
  await page.getByText('The website returned an error', { exact: true }).waitFor();
  await page.screenshot({ path: output + 'error-dark.png' });
  await page.getByRole('button', { name: 'Show details' }).click();
  await page.getByText('HTTP 500 · /', { exact: true }).waitFor();
  await page.evaluate(() => window.previewLoading.theme(false));
  await page.screenshot({ path: output + 'error-light.png' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('Opening your website', { exact: true }).waitFor();
  await page.clock.fastForward(31000);
  await page.getByText('Your website is taking too long', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.evaluate(() => window.previewLoading.network());
  await page.getByText('Couldn’t reach your website', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show details' }).click();
  assert.equal((await page.locator('body').innerText()).includes('SECRET'), false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.previewLoading.begin(); });
  await page.getByText('The website keeps reloading', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('mock-website').count(), 0, 'pause the looping WebView');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.evaluate(() => { window.previewLoading.begin(); window.previewLoading.script(); });
  await page.getByText('Your website couldn’t finish loading', { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({ path: output + 'error-compact.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS stable WebView, readiness, main HTTP errors, asset isolation, timeout, retry, redaction, reload pause, and dark/light/compact UI.');
} finally { await browser?.close(); close(); }
