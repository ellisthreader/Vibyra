import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const { url, close } = await serveFixture('tests/nativeHandoffFixture.tsx');
const browser = process.env.VIBYRA_TEST_WEBKIT ? await webkit.launch() : await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: /Live preview.*Tap to share/ }).click();
  await page.getByText('View this application?').waitFor();
  await page.getByRole('button', { name: 'Choose another preview', exact: true }).click();
  await page.getByRole('button', { name: 'Share Generic native application', exact: true }).click();
  await page.getByText('View this application?').waitFor();
  assert.equal(await page.evaluate(() => window.handoff.events.shares), 0);
  assert.equal(await page.evaluate(() => window.handoff.events.opens), 0);
  await page.getByRole('button', { name: 'View this window', exact: true }).click();
  assert.equal(await page.evaluate(() => window.handoff.events.shares), 1);
  // A late approval must not open a window after switching projects.
  await page.evaluate(() => { window.handoff.project('two'); });
  await page.getByText('Ready when your project is').waitFor();
  await page.evaluate(() => window.handoff.approve());
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.handoff.events.opens), 0);
  await page.evaluate(() => window.handoff.project('one'));
  await page.getByText('View this application?').waitFor();
  await page.getByRole('button', { name: 'View this window', exact: true }).click();
  await page.evaluate(() => window.handoff.approve());
  await page.waitForFunction(() => window.handoff.events.opens === 1);
  await page.evaluate(() => window.handoff.close());
  await page.waitForFunction(() => window.handoff.events.closes === 1);
  await page.evaluate(() => { window.handoff.mode('permission'); window.handoff.open(); });
  await page.getByText('Allow Vibyra screen recording in Mac System Settings, then try again.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.handoff.events.opens), 1);
  await page.evaluate(() => window.handoff.mode('candidate'));
  await page.getByText('View this application?').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS native candidate requires consent; stale approval cannot open another project; frame session closes; OS permission is actionable.');
} finally { await browser.close(); close(); }
