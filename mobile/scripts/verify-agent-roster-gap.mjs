import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/agentsBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agents', exact: true }).click();
  await page.getByRole('button', { name: 'Website helper, Needs your approval' }).click();
  const composer = page.getByRole('textbox', { name: 'Message Website helper' });
  await composer.fill('Keep this private draft.');
  await page.evaluate(() => window.gapAgentRoster(true));
  // The real screen polls its roster every 10 seconds while active.
  await page.waitForTimeout(11000);
  assert.equal(await page.getByRole('button', { name: 'Back to teammates' }).count(), 1,
    'a temporary roster omission must not eject the open conversation');
  assert.equal(await composer.count(), 1,
    'the open teammate conversation remains mounted');
  assert.equal(await composer.inputValue(), 'Keep this private draft.',
    'a temporary roster omission preserves the conversation draft');
  const send = page.getByRole('button', { name: 'Send message' });
  assert.ok(await send.count() === 0 || await send.isDisabled(),
    'the missing teammate cannot receive a new action');
  await page.evaluate(() => window.gapAgentRoster(false));
  await page.waitForTimeout(11000);
  assert.equal(await page.getByRole('button', { name: 'Back to teammates' }).count(), 1,
    'the conversation remains open after the roster recovers');
  assert.equal(await composer.inputValue(), 'Keep this private draft.');
  console.log('Agent conversation survives a missing teammate in one roster refresh and recovery.');
} finally {
  await browser?.close();
  close();
}
