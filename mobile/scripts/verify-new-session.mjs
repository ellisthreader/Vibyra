import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { capture, until } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-new-session';
await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/newSessionFixture.tsx');
let browser;
try {
  browser = process.env.VIBYRA_TEST_WEBKIT === '1' ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto(`${url}/?theme=${theme}`);
    for (const agent of ['Claude Code', 'Codex', 'Terminal']) await button(agent).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Session name' }).count(), 0);
    await capture(page, `${out}/new-session-${theme}.png`);
    await button('Terminal options').click();
    const safe = page.getByRole('switch', { name: 'Safe mode' });
    assert.equal(await safe.isChecked(), false);
    await page.getByRole('textbox', { name: 'Session name' }).fill('Try the new router');
    await button('Terminal').click();
    await until(async () => (await page.evaluate(() => window.started))?.[2] === 'Try the new router', 'terminal starts');
    assert.deepEqual(await page.evaluate(() => window.started), ['demo-studio', 'shell', 'Try the new router']);
    assert.equal(await page.evaluate(() => window.safeMode), false);
    await safe.check();
    await button('Codex').click();
    await button('GPT-6 Sol').waitFor();
    await capture(page, `${out}/new-session-models-${theme}.png`);
    await page.getByRole('textbox', { name: 'Search computer models' }).fill('luna');
    assert.equal(await button('GPT-6 Sol').count(), 0);
    await button('GPT-6 Luna').click();
    await until(() => page.evaluate(() => window.model === 'openai/gpt-6-luna'), 'exact model reaches launch');
    assert.equal(await page.evaluate(() => window.safeMode), true);
    await button('Back to terminal choices').click();
    await button('Claude Code').click();
    await button('Claude Opus 5.5').click();
    await until(() => page.evaluate(() => window.model === 'anthropic/claude-opus-5.5'), 'Opus reaches launch');
    await button('Back to terminal choices').click();
    await page.getByRole('textbox', { name: 'Session name' }).fill('Gemini in Studio');
    await button('Phone AI chat').click();
    await button('Google').click();
    await button('Gemini 3.8 Flash').click();
    await until(() => page.evaluate(() => window.openedChat), 'project phone chat opens');
    assert.deepEqual(await page.evaluate(() => window.vibesCalls),
      ['createChat:Gemini in Studio', 'vibes.bind:demo-studio', 'attach:demo-studio:fixture-binding']);
    await page.goto(`${url}/?theme=${theme}&phone=old`);
    await button('Codex').click();
    await until(() => page.evaluate(() => window.started?.[1] === 'codex'), 'old computer retains default launch');
    await button('Phone AI chat').click();
    await page.getByText('Update Vibyra Host on your computer to use these here.').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: default shell, exact GPT/Opus models, optional Safe mode, search, phone binding and older computers`);
  }
  for (const theme of ['dark', 'light']) for (const [width, height] of [[320, 568], [390, 430], [900, 720]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto(`${url}/?theme=${theme}&long`);
    for (const name of ['Claude Code', 'Codex', 'Terminal', 'Phone AI chat', 'Terminal options', 'Close New terminal']) {
      await button(name).scrollIntoViewIfNeeded();
      const box = await button(name).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.width >= 44 && box.height >= 44, `${name} touch target`);
      assert.ok(box.y >= 0 && box.y + box.height <= height + 1, `${name} reachable`);
    }
    await button('Claude Code').scrollIntoViewIfNeeded();
    await capture(page, `${out}/new-session-${width}-${height}-${theme}.png`);
    await page.goto(`${url}/?theme=${theme}&offline`);
    await button('Terminal').waitFor();
    for (const name of ['Claude Code', 'Codex', 'Terminal']) assert.ok(await button(name).isDisabled());
    await page.getByText('Studio Mac · Offline', { exact: true }).waitFor();
    await page.goto(`${url}/?theme=${theme}&slow`);
    await button('Codex').click();
    await button('GPT-6 Sol').click();
    for (const name of ['GPT-6 Sol', 'GPT-6 Luna', 'Back to terminal choices', 'Terminal options']) assert.ok(await button(name).isDisabled());
    await button('GPT-6 Luna').dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.startCount), 1);
    assert.deepEqual(await page.evaluate(() => window.started), ['demo-studio', 'codex', 'GPT-6 Sol']);
    await capture(page, `${out}/new-session-starting-${width}-${theme}.png`);
    await page.evaluate(() => window.finishStart());
    await until(() => button('GPT-6 Sol').isEnabled(), 'launch recovers');
    await page.close();
    console.log(`PASS ${theme} ${width}×${height}: long names, scrolling, touch targets, offline and single-start state`);
  }
  console.log(`Screenshots: ${out}. Browser checks; native acceptance is separate.`);
} finally { await browser?.close(); close(); }
