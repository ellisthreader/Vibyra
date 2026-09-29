import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

// Regression: enabling phone AI must never turn a terminal model change into a paid phone chat.
const out = '/tmp/vibyra-terminal-project-scope'; await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/conversationModelPickerFixture.tsx', {}, {
  [fileURLToPath(new URL('../src/ui/SessionScreen', import.meta.url))]: fileURLToPath(new URL('../tests/nativeConversationRouteFixture.tsx', import.meta.url)),
});
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?workspace&paid&theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message computer agent' });
    await input.fill('Keep this draft in Pocket.');
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    assert.equal(await picker.getByRole('button', { name: 'Anthropic', exact: true }).count(), 0);
    await picker.getByRole('button', { name: 'OpenAI', exact: true }).click();
    await picker.getByRole('radio', { name: 'Account model 2' }).click();
    await picker.getByText('Applying…', { exact: true }).waitFor();
    await page.evaluate(() => window.settlePicker(true));
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), 'Keep this draft in Pocket.');
    await page.getByRole('button', { name: 'Remove Draft image' }).waitFor();
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.pickerCalls), [{ model: 'account-two', effort: 'high', revision: 7 }]);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.evaluate(() => window.settleSend());
    await page.waitForFunction(() => document.querySelector('[aria-label="Message computer agent"]')?.value === '');
    assert.deepEqual(await page.evaluate(() => window.phoneCalls), [], 'No phone chat creation or quote request');
    await page.evaluate(() => window.removeProject());
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0, 'Deleted project removes every composer');
    await page.screenshot({ path: `${out}/${theme}-project-required.png` });
    await page.goto(`${fixture.url}/?workspace&home&paid&theme=${theme}`);
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0, 'Home never offers unbound input');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: full WorkspaceApp model change and send retain terminal, no quote calls, projectless home and removed project have no composer.`);
  }
  for (const state of ['saved', 'provider-stopped']) {
    const page = await browser.newPage();
    await page.goto(`${fixture.url}/?${state}&paid`);
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    await picker.getByText('Resume this terminal to load its account models.', { exact: true }).first().waitFor();
    assert.deepEqual(await page.evaluate(() => window.pickerReads), state === 'saved' ? [] : ['conversation.models']);
    assert.deepEqual(await page.evaluate(() => window.phoneCalls), []);
    assert.equal(await picker.getByRole('button', { name: 'Anthropic', exact: true }).count(), 0);
    await page.close();
  }
  console.log('PASS saved/stopped sessions: same-project recovery, no repeated provider reads or cloud fallback.');
} finally { await browser.close(); fixture.close(); }
