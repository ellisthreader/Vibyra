import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture, until } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// The New terminal sheet is a list of who can start in a project: the three
// agents on the computer, then every company the phone can run. Tapping a row is
// the start. This pins the rows, that a computer agent starts with the typed
// name, that a phone model opens a chat bound to the project, and that a
// computer without project tools says so instead of offering them.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-new-session'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/newSessionFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto(`${url}/?theme=${theme}`);
    for (const agent of ['Claude Code', 'Codex', 'Terminal']) await button(agent).waitFor();
    assert.equal(await button('Open terminal').count(), 0, 'no button to press after choosing');
    assert.equal(await button('Google').count(), 0, 'secondary models start collapsed');
    await capture(page, `${out}/new-session-${theme}.png`);
    // A computer agent starts on its row, with the typed name.
    await page.getByRole('textbox', { name: 'Session name' }).fill('Try the new router');
    await button('Terminal').click();
    await until(async () => (await page.evaluate(() => window.started))?.[2] === 'Try the new router', 'the terminal starts');
    assert.deepEqual(await page.evaluate(() => window.started), ['demo-studio', 'shell', 'Try the new router']);
    // A phone model opens a chat on that model, bound to this project. The name
    // went with the terminal, so this chat is named too.
    await page.getByRole('textbox', { name: 'Session name' }).fill('Gemini in Studio');
    await button('More AI models').click();
    for (const company of ['Google', 'Moonshot AI', 'xAI']) await button(company).waitFor();
    await button('Google').click();
    await button('Gemini 3.8 Flash').waitFor();
    await capture(page, `${out}/new-session-company-${theme}.png`);
    await button('Gemini 3.8 Flash').click();
    await until(() => page.evaluate(() => window.openedChat), 'the chat opens');
    assert.deepEqual(await page.evaluate(() => window.vibesCalls),
      ['createChat:Gemini in Studio', 'vibes.bind:demo-studio', 'attach:demo-studio:fixture-binding'], 'the chat is made, bound and attached');
    // A Host without project tools cannot bind, so the phone's agents step aside with a reason.
    await page.goto(`${url}/?theme=${theme}&phone=old`);
    await button('Terminal').waitFor();
    await button('More AI models').click();
    await page.getByText('Update Vibyra Host on your computer to use these here.').waitFor();
    assert.equal(await button('Google').count(), 0, 'no company is offered it cannot start');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: rows start agents on the computer and on the phone, and the sheet says when the phone cannot.`);
  }
  for (const theme of ['dark', 'light']) for (const [width, height] of [[320, 568], [390, 430], [900, 720]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto(`${url}/?theme=${theme}&long`);
    await button('Terminal').waitFor();
    for (const name of ['Claude Code', 'Codex', 'Terminal', 'More AI models', 'Close New terminal']) {
      await button(name).scrollIntoViewIfNeeded();
      const box = await button(name).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.width >= 44 && box.height >= 44, `${name} fits with a 44pt target`);
      assert.ok(box.y >= 0 && box.y + box.height <= height + 1, `${name} scrolls clear of screen edges`);
    }
    await button('Claude Code').scrollIntoViewIfNeeded();
    await capture(page, `${out}/new-session-${width}-${height}-${theme}.png`);
    await page.goto(`${url}/?theme=${theme}&offline`);
    await button('Terminal').waitFor();
    for (const name of ['Claude Code', 'Codex', 'Terminal']) assert.ok(await button(name).isDisabled());
    await page.getByText('Studio Mac · Offline', { exact: true }).waitFor();
    await page.goto(`${url}/?theme=${theme}&slow`);
    await button('Codex').click();
    await page.getByText('Starting terminal…', { exact: true }).waitFor();
    for (const name of ['Claude Code', 'Codex', 'Terminal', 'More AI models']) assert.ok(await button(name).isDisabled());
    assert.equal(await page.getByRole('textbox', { name: 'Session name' }).isEditable(), false);
    await button('Terminal').dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.startCount), 1, 'no second launch while starting');
    assert.deepEqual(await page.evaluate(() => window.started), ['demo-studio', 'codex', 'Codex chat']);
    await capture(page, `${out}/new-session-starting-${width}-${theme}.png`);
    await page.evaluate(() => window.finishStart());
    await until(() => button('Terminal').isEnabled(), 'choices recover after starting');
    await page.close();
    console.log(`PASS ${theme} ${width}×${height}: long names, scrolling, touch targets, offline and single-start state`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} finally {
  await browser?.close();
  close();
}
