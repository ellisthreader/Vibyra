import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fullyVisible, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-connection-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const [size, width, height] of [['compact', 375, 667], ['iphone', 390, 844], ['wide', 1024, 900]]) {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const button = name => page.getByRole('button', { name, exact: true });
      const shot = name => page.screenshot({ path: `${out}/${size}-${colorScheme}-${name}.png` });
      await page.route('**/identity', route => route.fulfill({ status: 404, body: '' }));
      await page.goto(process.env.VIBYRA_URL ?? 'http://127.0.0.1:8081');
      await button('Get started').click();
      await button('Skip for now').click();
      await fullyVisible(button('Connect computer'), page, 'Selected path action');
      const computer = page.getByRole('radio', { name: 'Connect your computer', exact: true });
      const phone = page.getByRole('radio', { name: 'Code on this phone', exact: true });
      assert.equal(await computer.getAttribute('aria-checked'), 'true');
      await phone.click();
      assert.equal(await phone.getAttribute('aria-checked'), 'true');
      await fullyVisible(button('Start on phone'), page, 'Phone path action');
      await computer.click();
      await page.getByRole('heading', { name: 'How do you want to code?' }).scrollIntoViewIfNeeded();
      await shot('path');
      await button('Connect computer').click();
      await fullyVisible(button('I’ve installed it'), page, 'Installation confirmation');
      assert.equal(await page.getByRole('textbox', { name: 'Computer pairing link' }).count(), 0);
      await shot('setup');
      await button('I’ve installed it').click();
      // Loopback is always a candidate, so even the browser preview runs a real
      // search: it asks 127.0.0.1 for a Host and reports what happened. It
      // never tells someone already inside the app to go and get the app.
      // Scoped to the sheet: the onboarding screen behind it has its own heading.
      const heading = page.getByRole('dialog').getByRole('heading').first();
      await heading.waitFor();
      await until(async () => /Looking for your|No computer|Found/.test(await heading.innerText()),
        'a real search on the browser preview');
      const body = await page.locator('body').innerText();
      assert.doesNotMatch(body, /download|install the (Vibyra )?app|get the app/i,
        'a client inside the app must never be told to get the app');
      assert.doesNotMatch(body, /No network to search/,
        'loopback is always searchable, so this state must not appear here');
      await fullyVisible(button('Back to setup'), page, 'Return to setup');
      await shot('fallback');
      // Setup stays intact, and returning never resumes a dismissed search.
      await button('Back to setup').click();
      await fullyVisible(button('I’ve installed it'), page, 'Return to setup');
      assert.equal(await page.getByRole('textbox', { name: 'Computer pairing link' }).count(), 0);
      await button('Close Connect your computer').click();
      await button('Connect computer').click();
      await fullyVisible(button('I’ve installed it'), page, 'Reopened setup');
      await button('Close Connect your computer').click();
      await button('Skip — I’ll decide later').click();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS ${size}/${colorScheme}: path radios, setup, search, dismissal and skip`);
      await page.close();
    }
  }
} finally { await browser.close(); }
console.log(`Screenshots: ${out}`);
