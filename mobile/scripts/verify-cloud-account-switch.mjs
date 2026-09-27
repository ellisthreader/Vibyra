import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/cloudAccountSwitchFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByText('First account Mac').waitFor();
  await page.getByRole('button', { name: 'Switch account' }).click();
  await page.getByText('Second account Mac').waitFor();
  assert.equal(await page.getByText('First account Mac').count(), 0,
    'the previous account computer must disappear on account switch');
  assert.deepEqual(await page.evaluate(() => window.cloudCalls),
    ['first@example.com', 'second@example.com']);
  await page.getByRole('button', { name: 'Sign out' }).click();
  assert.equal(await page.getByText('Second account Mac').count(), 0,
    'no account computer remains visible after sign-out');
  console.log('Cloud computer list refreshes on account switch and hides on sign-out.');
} finally {
  await browser?.close();
  close();
}
