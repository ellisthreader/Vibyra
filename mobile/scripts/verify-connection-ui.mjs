import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fullyVisible } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-connection-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true });
try {
  for (const [size, width, height] of [['compact', 375, 667], ['iphone', 390, 844], ['wide', 1024, 900]]) {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const button = name => page.getByRole('button', { name, exact: true });
      const shot = name => page.screenshot({ path: `${out}/${size}-${colorScheme}-${name}.png` });
      await page.goto(process.env.VIBYRA_URL ?? 'http://localhost:8081');
      await button('Get started').click();
      await button('Skip for now').click();
      await shot('path');
      await button('Connect computer').click();
      await fullyVisible(button('I’ve installed it'), page, 'Installation confirmation');
      assert.equal(await page.getByRole('textbox', { name: 'Computer pairing link' }).count(), 0);
      await shot('setup');
      await button('I’ve installed it').click();
      await page.getByText('Connect with a code', { exact: true }).waitFor();
      // Without the native Bonjour module there is no search, no radar and no
      // permission story: only the honest code route.
      assert.equal(await page.getByText('Scanning this Wi-Fi', { exact: false }).count(), 0,
        'Web must not pretend to search the LAN');
      for (const absent of ['Connect with a code instead', 'Search again', 'Open Settings']) {
        assert.equal(await button(absent).count(), 0, `${absent} belongs to the native search`);
      }
      await fullyVisible(button('Use pairing code'), page, 'Pairing fallback');
      await shot('fallback');
      await button('Use pairing code').click();
      await page.getByRole('textbox', { name: 'Computer pairing link' }).fill('invalid');
      await button('Connect').click();
      await page.getByText('Scan or paste a Vibyra pairing code from your computer.', { exact: true }).waitFor();
      await button('Close Connect your computer').click();
      await button('Connect computer').click();
      await fullyVisible(button('I’ve installed it'), page, 'Reopened setup');
      await button('I have a pairing code').click();
      assert.equal(await page.getByRole('textbox', { name: 'Computer pairing link' }).inputValue(), '');
      await button('Close Connect your computer').click();
      await button('Skip — I’ll decide later').click();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS ${size}/${colorScheme}: setup, explicit confirmation, honest fallback, invalid pairing, dismissal and skip`);
      await page.close();
    }
  }
} finally { await browser.close(); }
console.log(`Screenshots: ${out}`);
