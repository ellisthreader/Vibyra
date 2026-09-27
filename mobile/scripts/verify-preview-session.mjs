import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/previewSessionFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.previewEvents?.opens === 1);
  for (let index = 0; index < 10; index++) {
    await page.evaluate(() => window.refreshPreviewProjects());
    await page.waitForFunction(expected => window.previewProjectUpdates === expected, index + 2);
  }
  assert.deepEqual(await page.evaluate(() => window.previewEvents), { opens: 1, closes: 0 },
    'Host project snapshots must not restart an open Preview proxy');
  await page.evaluate(() => window.switchPreviewProject());
  await page.waitForFunction(() => window.previewEvents?.opens === 2 && window.previewEvents?.closes === 1);
  await page.evaluate(() => window.closePreviewSheet());
  await page.waitForFunction(() => window.previewEvents?.closes === 2);
  assert.deepEqual(errors, []);
  console.log('PASS Preview proxy remains open across project snapshots and closes on scope changes.');
} finally {
  await browser?.close();
  close();
}
