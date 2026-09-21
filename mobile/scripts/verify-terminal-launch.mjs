import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const fixture = await serveFixture('tests/terminalLaunchBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(fixture.url);
    const button = name => page.getByRole('button', { name, exact: true });
    const open = async () => {
      await button('Open project menu').click();
      await button('New chat in Pocket').click();
      await page.getByRole('textbox', { name: 'Session name' }).waitFor();
      assert.equal(await page.getByTestId('navigation-drawer').count(), 0, 'Picker opens only after the drawer leaves');
    };
    await open(); await button('Close New terminal').click();
    await page.getByText('Created 0 terminals · 0 attempts', { exact: true }).waitFor();
    await open();
    await page.getByRole('textbox', { name: 'Session name' }).fill('First terminal');
    await button('Terminal').click();
    await page.getByText('Opened First terminal in Pocket', { exact: true }).waitFor();
    await page.getByText('Created 1 terminals · 1 attempts', { exact: true }).waitFor();
    await button('Fail next creation').click(); await open();
    await page.getByRole('textbox', { name: 'Session name' }).fill('Retry terminal');
    await button('Codex').click();
    await page.getByText('The computer could not start this terminal. Try again.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Session name' }).inputValue(), 'Retry terminal');
    await button('Codex').click();
    await page.getByText('Opened Retry terminal in Pocket', { exact: true }).waitFor();
    await page.getByText('Created 2 terminals · 3 attempts', { exact: true }).waitFor();
    await button('Open project menu').click();
    const close = button('Close terminal Retry terminal');
    const target = await close.boundingBox(); assert.ok(target.width >= 44 && target.height >= 44);
    page.once('dialog', dialog => dialog.dismiss()); await close.click();
    assert.equal(await close.count(), 1, 'Cancel keeps the terminal open');
    page.once('dialog', dialog => dialog.accept()); await close.click();
    await close.waitFor({ state: 'detached' });
    assert.equal(await button('Close terminal First terminal').count(), 1, 'Other terminals stay open');
    await button('Close navigation menu').click();
    await page.getByText('No terminal selected', { exact: true }).waitFor();
    await page.getByText('Closed 1 terminals', { exact: true }).waitFor();
    await button('Open project menu').click();
    await page.getByRole('button', { name: /^First terminal,/ }).click();
    await page.getByText('Opened First terminal in Pocket', { exact: true }).waitFor();
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${reducedMotion}: picker, create/retry, close confirmation/cancel, exact target and selection cleanup`);
  }
  for (const access of ['watch', 'offline']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${fixture.url}/?access=${access}`);
    await page.getByRole('button', { name: 'Open project menu', exact: true }).click();
    const close = page.getByRole('button', { name: 'Close terminal Welcome screen', exact: true });
    if (access === 'watch') assert.equal(await close.count(), 0, 'Viewing never grants terminal management');
    else { await close.waitFor(); assert.equal(await close.getAttribute('aria-disabled'), 'true'); }
    await page.close();
  }
  console.log('PASS view-only and disconnected close boundaries');
} finally { await browser?.close(); fixture.close(); }
