import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const fixture = await serveFixture('tests/remoteDashboardFixture.tsx');
await mkdir('/private/tmp/vibyra-remote-security', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${fixture.url}?theme=${theme}`);
    await page.getByText('Home Desktop', { exact: true }).waitFor();
    await page.screenshot({ path: `/private/tmp/vibyra-remote-security/${theme}-dashboard.png` });
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByText('No passkeys added', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await page.getByText('Revoked', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.getByText('No active sessions').waitFor();
    await page.getByRole('button', { name: 'Disable all remote access', exact: true }).click();
    await page.getByText('Offline', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.securityCalls), ['remove-passkey', 'revoke', 'disconnect', 'disable']);
    assert.deepEqual(errors, []); await page.close();
  }
  const offline = await browser.newPage({ viewport: { width: 390, height: 844 } });
  offline.on('dialog', dialog => dialog.accept());
  await offline.goto(`${fixture.url}?offline=1`);
  await offline.getByRole('button', { name: 'Disable all remote access', exact: true }).click();
  await offline.getByText('This phone disconnected. The remote security change is unconfirmed. Try again when Vibyra is reachable.', { exact: true }).waitFor();
  assert.deepEqual(await offline.evaluate(() => window.securityLocalState()), { status: 'offline', autoConnect: false });
  assert.deepEqual(await offline.evaluate(() => window.securityCalls), ['disable']);
  await offline.close();
  console.log('Remote dashboard themes and revoke/disconnect/disable actions passed against isolated fixtures.');
} finally { await browser.close(); fixture.close(); }
