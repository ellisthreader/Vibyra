import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { serveFixture } from './fixture-server.mjs';

const server = await serveFixture('tests/walletBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.url}/?version=2&purchases=off`);
  await page.getByRole('heading', { name: /Vibyra tokens available$/ }).waitFor();
  await page.getByRole('button', { name: 'See Pro plans' }).click();
  await page.getByText('Pro purchases are not available right now. You can keep using Free.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Get Pro/ }).count(), 0);
  assert.equal(await page.getByText(/Renews monthly until cancelled/).count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Add \d+ tokens/ }).count(), 0);
  for (const name of ['Terms', 'Privacy', 'App licence']) {
    const link = page.getByRole('link', { name, exact: true });
    await link.waitFor();
    assert.ok((await link.boundingBox())?.height >= 44, `${name} has a usable touch target`);
  }
  assert.deepEqual(errors, []);
  await page.close();

  const active = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
  active.on('pageerror', error => errors.push(error.message));
  await active.goto(`${server.url}/`);
  await active.getByRole('heading', { name: /Vibyra tokens available$/ }).waitFor();
  await active.getByRole('button', { name: 'Upgrade your plan' }).click();
  await active.getByRole('button', { name: 'Get Pro 20× · £99.00 a month' }).waitFor();
  await active.getByRole('link', { name: 'Terms', exact: true }).waitFor();
  await active.getByRole('link', { name: 'Privacy', exact: true }).waitFor();
  await active.getByRole('link', { name: 'App licence', exact: true }).waitFor();
  await active.context().route('**/legal/terms', route => route.fulfill({ status: 200, body: 'Terms test page' }));
  const opened = active.waitForEvent('popup');
  await active.getByRole('link', { name: 'Terms', exact: true }).click();
  const termsPage = await opened;
  await termsPage.waitForURL('**/legal/terms');
  assert.equal(new URL(termsPage.url()).hostname, 'vibyra-production.up.railway.app');
  await termsPage.close();
  assert.deepEqual(errors, []);
  await active.close();
  console.log('PASS legal paywall: disabled sales have no purchase action; Terms, Privacy and app licence remain reachable.');
} finally {
  await browser.close();
  server.close();
}
