import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { serveFixture } from './fixture-server.mjs';
const server = await serveFixture('tests/walletBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
await mkdir('/tmp/vibyra-membership-ui', { recursive: true });
try {
  for (const [name, width, height] of [['phone', 393, 852], ['compact', 320, 640], ['desktop', 1280, 900]]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${server.url}/?version=2&bridge=off&theme=${theme}`);
      await page.getByText('Paid tokens', { exact: false }).count();
      await page.getByRole('heading', { name: /Vibyra tokens available/ }).waitFor();
      assert.equal(await page.getByRole('progressbar').count(), 0);
      await page.getByRole('button', { name: 'Add 80 tokens · £4.99' }).waitFor();
      await page.getByRole('button', { name: 'Show token activity' }).click();
      await page.getByText(/Unused tokens returned.*0.0123 tokens/).waitFor();
      await page.screenshot({ path: `/tmp/vibyra-membership-ui/${name}-${theme}-wallet.png` });
      await page.getByRole('button', { name: 'Upgrade your plan' }).click();
      await page.getByText('Get Vibyra Pro', { exact: true }).waitFor();
      await page.getByText('300', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Get Pro · £19.99 a month' }).waitFor();
      assert.equal(await page.getByText('10×', { exact: true }).count(), 0);
      assert.equal(await page.getByText('20×', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Available in the installed iPhone app.').count(), 0);
      await page.screenshot({ path: `/tmp/vibyra-membership-ui/${name}-${theme}-pro.png` });
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${name}/${theme}: fractional balance, Free packs, single Pro, website handoff`);
    }
  }
} finally { await browser.close(); server.close(); }
