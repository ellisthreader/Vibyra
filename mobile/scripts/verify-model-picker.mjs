import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';
import { checkPicker, chooseCompany } from './verify-vibes-picker.mjs';

const out = '/tmp/vibyra-model-picker'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/vibesBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const [width, height] of [[320, 667], [375, 667], [430, 932], [900, 720]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: width === 430 ? 'no-preference' : 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${url}/?theme=${theme}`);
      const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
      await input.fill('Keep this draft through every model change.');
      await checkPicker(page, capture, out, `${width}-${theme}`);
      await input.focus();
      await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
      const picker = page.getByRole('region', { name: 'Choose your AI' });
      const previous = picker.getByRole('button', { name: 'Previous companies', exact: true });
      const next = picker.getByRole('button', { name: 'Next companies', exact: true });
      assert.ok(await previous.isDisabled(), 'The first page keeps its left arrow in place');
      assert.equal(await picker.getByText(/^(More companies|Back to start)$/).count(), 0);
      const left = await previous.boundingBox(), right = await next.boundingBox();
      assert.equal(left.width, right.width); assert.equal(left.height, right.height);
      await next.click(); await previous.click();
      await picker.getByRole('button', { name: 'OpenAI', exact: true }).waitFor();
      const bounds = await picker.boundingBox();
      assert.ok(bounds.height <= 345 && bounds.y > 150, 'Compact picker leaves the conversation visible');
      await chooseCompany(page, 'Anthropic');
      await picker.getByRole('radio', { name: /Sonnet 5, membership needed/ }).click();
      await picker.getByText(/Included with a membership/).waitFor();
      assert.equal(await picker.getByRole('radio', { checked: true }).count(), 0, 'Locked models cannot become selected');
      await capture(page, `${out}/${width}-${theme}-locked.png`);
      await picker.getByRole('button', { name: 'Search AI models' }).click();
      const search = picker.getByRole('textbox', { name: 'Search AI models' });
      assert.ok(await search.evaluate(el => el === document.activeElement), 'Search opens ready to type');
      await search.fill('Sonnet');
      await capture(page, `${out}/${width}-${theme}-search.png`);
      await picker.getByRole('button', { name: 'Clear search' }).click();
      assert.equal(await search.inputValue(), '');
      assert.ok(await search.evaluate(el => el === document.activeElement), 'Clearing search keeps typing focus');
      await search.fill('no-such-model-xyz');
      await picker.getByText('No models found', { exact: true }).waitFor();
      await capture(page, `${out}/${width}-${theme}-empty.png`);
      await picker.getByRole('button', { name: 'Back to companies' }).click();
      await picker.getByRole('button', { name: 'Hide model search' }).click();
      await chooseCompany(page, 'Qwen');
      await picker.getByRole('radio', { name: 'Qwen3.8 Flash', exact: true }).waitFor();
      await picker.getByRole('button', { name: 'Back to companies' }).click();
      await page.setViewportSize({ width, height: 430 });
      await chooseCompany(page, 'OpenAI');
      const model = await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).boundingBox();
      assert.ok(model.y >= 0 && model.y + model.height <= 430, 'Models fit with keyboard-sized space');
      await capture(page, `${out}/${width}-${theme}-short.png`);
      await picker.getByRole('button', { name: 'Close model picker' }).click();
      await picker.waitFor({ state: 'hidden' });
      assert.equal(await input.inputValue(), 'Keep this draft through every model change.');
      await page.waitForTimeout(300);
      assert.ok(await input.evaluate(el => el === document.activeElement), 'Typing focus returns after closing the picker');
      await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
      await chooseCompany(page, 'OpenAI');
      await page.keyboard.press('Escape');
      await picker.getByRole('heading', { name: 'Choose company' }).waitFor();
      await page.keyboard.press('Escape');
      await picker.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${url}/?theme=${theme}&catalogue=full&paid=1`);
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('Compare the real model choices.');
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    await chooseCompany(page, 'Anthropic');
    assert.equal(await picker.getByRole('radio').count(), 4, 'All four curated Anthropic models are offered');
    assert.equal(await picker.getByRole('radio', { name: /membership needed/ }).count(), 0, 'Paid availability unlocks the models');
    await capture(page, `${out}/375-${theme}-full-models.png`);
    const selected = picker.getByRole('radio').last();
    const name = (await selected.getAttribute('aria-label')).replace(/, new$/, '');
    await selected.click();
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).getByText(name, { exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'Compare the real model choices.');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(`${url}/?catalogue=empty`);
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    await page.getByRole('button', { name: 'OpenAI', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Next companies', exact: true }).count(), 'An empty backend catalogue retains the store fallback');
    await page.getByRole('radio', { name: 'Auto', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    await page.close();
  }
  console.log(`PASS inline picker: company/model navigation, narrow/wide, both themes, motion modes, search, selection, locks, draft preservation and keyboard space. ${out}`);
} finally { await browser.close(); close(); }
