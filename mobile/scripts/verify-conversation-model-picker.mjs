import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = '/tmp/vibyra-conversation-picker'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/conversationModelPickerFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [375, 900]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 667 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message computer agent' });
    await input.fill('Keep my computer-chat draft.');
    await input.focus();
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    await picker.getByRole('heading', { name: 'Choose company' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Computer picker is inline');
    assert.equal(await picker.getByRole('radio', { name: 'Auto', exact: true }).count(), 0, 'No cloud Auto in account models');
    assert.equal(await input.count(), 0, 'Panel occupies the composer');
    await capture(page, `${out}/${width}-${theme}-companies.png`);
    await picker.getByRole('button', { name: 'OpenAI', exact: true }).click();
    assert.equal(await picker.getByRole('radio').count(), 4);
    await picker.getByRole('button', { name: 'Next models', exact: true }).click();
    await picker.getByRole('radio', { name: 'Account model 5' }).waitFor();
    await picker.getByRole('button', { name: 'Search AI models' }).click();
    await picker.getByRole('textbox', { name: 'Search AI models' }).fill('account-latest');
    const choice = picker.getByRole('radio', { name: 'Account model 5' });
    await choice.click();
    await picker.getByText('Applying…', { exact: true }).waitFor();
    assert.equal(await choice.getAttribute('aria-disabled'), 'true');
    assert.deepEqual(await page.evaluate(() => window.pickerCalls), [{ model: 'account-latest', effort: 'high', revision: 7 }]);
    await page.evaluate(() => window.settlePicker(false));
    await picker.getByText(/Settings changed on the computer/).waitFor();
    assert.equal(await picker.count(), 1, 'Refused changes retain the picker');
    await choice.click(); await picker.getByText('Applying…', { exact: true }).waitFor();
    await page.evaluate(() => window.settlePicker(true));
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), 'Keep my computer-chat draft.');
    await page.getByRole('button', { name: 'Remove Draft image' }).waitFor();
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).getByText('Account model 5', { exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Message computer agent');
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    await picker.getByRole('button', { name: 'OpenAI', exact: true }).click();
    await page.setViewportSize({ width, height: 430 });
    assert.ok((await picker.boundingBox()).height <= 344);
    await capture(page, `${out}/${width}-${theme}-models.png`);
    await page.keyboard.press('Escape');
    await picker.getByRole('heading', { name: 'Choose company' }).waitFor();
    await page.keyboard.press('Escape'); await picker.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    await page.close(); console.log(`PASS ${width}/${theme}: inline account models, paging/search, pending/refused/accepted changes, draft/attachment/focus, short layout.`);
  }
} finally { await browser.close(); close(); }
