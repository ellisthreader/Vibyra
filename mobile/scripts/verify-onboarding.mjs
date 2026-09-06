import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
const url = process.env.VIBYRA_URL ?? 'http://localhost:4186';
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-onboarding-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  for (const [name, width, height, colorScheme] of [['phone-dark', 390, 844, 'dark'], ['phone-light', 375, 667, 'light'],
    ['desktop', 1280, 900, 'dark'], ['landscape', 844, 390, 'light']]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByText('Work in progress', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Prompt for new chat' }).count(), 0);
    await capture(page, `${out}/${name}-welcome.png`);
    await page.getByRole('button', { name: 'Computer setup instructions' }).click();
    await page.getByText('Set up your computer', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Connect computer', exact: true }).click();
    await page.getByRole('textbox', { name: 'Computer pairing link' }).fill('invalid link');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByText('Scan or paste a Vibyra pairing code from your computer.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close Connect your computer' }).click();
    await page.getByRole('button', { name: 'Explore sample workspace' }).click();
    await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Leave sample workspace' }).click();
    await page.getByText('Work in progress', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Work in progress', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Set up later', exact: true }).click();
    await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
    await page.reload();
    await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Welcome and computer setup' }).click();
    await page.getByText('Work in progress', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS: ${name} first-run, setup help, invalid link, sample isolation, skip persistence and reopen.`);
  }
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Set up later', exact: true }).click();
  await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
  await page.getByText(/could not save setup/).waitFor();
  console.log('PASS: blocked browser storage allows setup and explains persistence failure.');
} finally { await browser.close(); }
