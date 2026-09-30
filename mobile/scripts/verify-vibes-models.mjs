import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { checkEffort, checkPicker } from './verify-vibes-picker.mjs';
import { serveFixture } from './fixture-server.mjs';

// The model picker and the effort selector on the AI screen, run on their own.
// `verify-vibes-ui.mjs` reaches them only after its wallet and purchase steps, so
// a wallet rewrite takes this coverage down with it. These two controls are worth
// checking whether or not the upgrade page is mid-change.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-vibes-models'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/vibesBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?theme=${theme}`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    await checkPicker(page, capture, out, theme);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Help me design a simple welcome screen.');
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    await checkEffort(page, capture, out, theme);
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
    await page.close();
    console.log(`PASS ${theme}: companies ordered, artwork shown, effort ladder is the model's own.`);
  }
} finally { await browser?.close(); close(); }
