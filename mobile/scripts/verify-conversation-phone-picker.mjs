import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

const out = '/tmp/vibyra-conversation-phone-picker'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/conversationModelPickerFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) for (const state of ['saved', 'provider-stopped', 'live']) {
    const saved = state === 'saved', stopped = state !== 'live';
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?phone&paid&theme=${theme}&${state}`);
    const input = page.getByRole('textbox', { name: 'Message computer agent' });
    await input.fill('Keep this draft with its original computer conversation.');
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    for (const company of ['OpenAI', 'Anthropic', 'Google', 'xAI']) await picker.getByRole('button', { name: company, exact: true }).waitFor();
    await fullyVisible(picker.getByRole('heading', { name: 'Choose company' }), page, 'Company heading');
    assert.equal(await picker.getByText('New phone chat · Vibyra tokens', { exact: true }).count(), 0);
    assert.equal(await page.getByText(/Live provider data is unavailable/).count(), 0);
    if (stopped) {
      assert.deepEqual(await page.evaluate(() => window.pickerReads), saved ? [] : ['conversation.models'], 'A stopped provider is never polled repeatedly');
      assert.equal(await picker.getByRole('button', { name: 'Models for this computer chat' }).count(), 0);
    } else {
      await picker.getByRole('button', { name: 'Models for this computer chat' }).click();
      await picker.getByRole('button', { name: 'OpenAI', exact: true }).click();
      await picker.getByRole('radio', { name: 'Account model 1' }).waitFor();
      await picker.getByRole('button', { name: 'All companies · Phone AI' }).click();
    }
    await capture(page, `${out}/${theme}-${state}-companies.png`);
    await picker.getByRole('button', { name: 'Anthropic', exact: true }).click();
    await picker.getByRole('radio', { name: /Sonnet 5/ }).click();
    await page.getByText('Phone chat opened: anthropic/claude-sonnet-5', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.pickerCalls), [], 'Phone choice does not change the computer agent');
    assert.deepEqual(await page.evaluate(() => window.phoneCalls), [], 'Selection alone never creates a backend chat or sends a turn');
    await page.getByRole('button', { name: 'Return to saved conversation' }).click();
    assert.equal(await input.inputValue(), 'Keep this draft with its original computer conversation.');
    await page.getByRole('button', { name: 'Remove Draft image' }).waitFor();
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${theme}/${state}: all companies, unavailable-provider recovery, phone navigation, computer draft/attachment retained.`);
  }
  for (const [provider, company] of [['claude', 'Anthropic'], ['gemini', 'Google']]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000); await page.goto(`${url}/?provider=${provider}`);
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    await picker.getByRole('button', { name: company, exact: true }).click();
    await picker.getByRole('radio', { name: 'Account model 1' }).waitFor();
    assert.equal(await picker.getByRole('button', { name: 'OpenAI', exact: true }).count(), 0);
    await page.close(); console.log(`PASS ${provider}: correct computer-account company.`);
  }
} finally { await browser.close(); close(); }
