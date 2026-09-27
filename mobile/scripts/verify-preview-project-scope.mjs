import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/previewProjectScopeFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const shown = async live => {
    await page.waitForFunction(expected =>
      Boolean(document.querySelector('[data-testid="preview-header"]')) === expected &&
      document.body.textContent.includes('localhost:5173') === expected, live);
  };
  await shown(true);
  await page.evaluate(() => window.scopeControl.hold());
  await page.waitForFunction(() => window.scopeControl.pending() === 2);
  await page.evaluate(() => window.scopeControl.project('other'));
  await shown(false);
  await page.waitForFunction(() => window.scopeControl.pending() === 4);
  await page.evaluate(() => window.scopeControl.release());
  await shown(false);
  // A stale known target and an approved but stopped target must neither open nor start.
  await page.evaluate(() => window.scopeControl.show());
  await page.getByText('Ready when your website is', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.scopeEvents), { opens: [], starts: [], closes: 0 });
  await page.evaluate(() => window.scopeControl.project('alias'));
  await shown(true);
  await page.evaluate(() => window.scopeControl.moveAlias());
  await shown(false);
  await page.evaluate(() => window.scopeControl.project('site'));
  await shown(true);
  await page.getByTestId('preview-header').click();
  await page.waitForFunction(() => window.scopeEvents.opens.length === 1);
  await page.evaluate(() => window.scopeControl.close());
  await page.waitForFunction(() => window.scopeEvents.closes === 1);
  await page.evaluate(() => window.scopeControl.stop());
  await shown(false);
  assert.deepEqual(errors, []);
  console.log('PASS project-scoped header/card, late results, folder changes, stopped sites and Preview opening.');
} finally {
  await browser?.close();
  close();
}
