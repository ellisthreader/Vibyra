import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const fixture = await serveFixture('tests/remoteSecurityFixture.tsx');
const out = '/private/tmp/vibyra-remote-security';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[375, 667], [390, 844], [1024, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${fixture.url}?theme=${theme}`);
      await page.getByRole('button', { name: 'Connect securely', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.permissions), ['preview:access', 'screen:view']);
      await page.getByRole('radio').filter({ hasText: 'Terminals' }).click();
      await page.getByRole('button', { name: 'Connect securely', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.permissions), ['terminal:access']);
      await page.getByRole('switch', { name: 'Read project files' }).click();
      await page.getByRole('button', { name: 'Connect securely', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.permissions), ['terminal:access', 'files:read']);
      await page.screenshot({ path: `${out}/${theme}-${width}-permissions.png` });
      for (const state of ['approval', 'authentication']) {
        await page.goto(`${fixture.url}?theme=${theme}&state=${state}`);
        await page.getByRole('heading', { name: state === 'approval' ? 'Approve this iPhone' : 'Verify with your passkey' }).waitFor();
        if (state === 'approval') await page.getByText('Match this code: 472831').waitFor();
        await page.screenshot({ path: `${out}/${theme}-${width}-${state}.png` });
      }
      assert.deepEqual(errors, []); await page.close();
    }
  }
  console.log('Remote security UI: six theme/size layouts, explicit permission defaults and approval/passkey states passed.');
} finally { await browser.close(); fixture.close(); }
