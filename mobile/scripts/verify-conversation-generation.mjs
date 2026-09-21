import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-conversation-generation';
await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/generationBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932], ['wide', 844, 390]]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const button = name => page.getByRole('button', { name, exact: true });
      const input = page.getByRole('textbox', { name: 'Message computer agent' });
      await input.waitFor();
      const indicator = page.getByTestId('conversation-generation');
      assert.equal(await indicator.count(), 1, 'Overlapping provider items have one live indicator');
      const stopBounds = await button('Stop AI reply').boundingBox();
      assert.ok(stopBounds.width >= 44 && stopBounds.height >= 44, 'Stop has a full 44pt touch target');
      assert.equal(await page.getByText('Your next draft can wait here.', { exact: true }).count(), 0);
      const disclosure = button('Updating files. Show work details');
      assert.equal(await disclosure.count(), 1, 'Commentary and tool steps form one disclosure');
      assert.ok((await disclosure.boundingBox()).height >= 44);
      await capture(page, `${out}/${size}-${theme}-working.png`);
      await disclosure.click();
      await page.getByText('I’ll simplify the layout and give the main action more room.', { exact: true }).waitFor();
      await button('Thinking, running').click();
      await page.getByText('Checking the welcome screen layout and the existing spacing system.', { exact: true }).waitFor();
      assert.equal(await indicator.count(), 1, 'Expanding the history never starts a second indicator');
      await capture(page, `${out}/${size}-${theme}-expanded.png`);
      await button('Updating files. Hide work details').click();
      await input.fill('Keep the buttons simple.');
      await button('Show streaming').click();
      await page.getByText('The welcome screen now has a calmer layout, with more room around the main action.', { exact: true }).waitFor();
      assert.equal(await indicator.count(), 1);
      assert.equal(await indicator.getAttribute('aria-label'), 'Writing response');
      assert.equal(await input.inputValue(), 'Keep the buttons simple.');
      await capture(page, `${out}/${size}-${theme}-streaming.png`);
      await button('Show completed').click();
      assert.equal(await indicator.count(), 0);
      assert.equal(await input.inputValue(), 'Keep the buttons simple.');
      await capture(page, `${out}/${size}-${theme}-completed.png`);
      await button('Show thinking').click();
      assert.equal(await indicator.count(), 1);
      assert.equal(await indicator.getAttribute('aria-label'), 'Thinking');
      await input.fill('/status');
      assert.equal(await button('Stop AI reply').count(), 1, 'Typing a slash never replaces Stop with Send');
      assert.equal(await button('Send message').count(), 0);
      await input.fill('Keep this draft after stopping.');
      await button('Stop AI reply').click();
      await button('Send message').waitFor();
      assert.equal(await input.inputValue(), 'Keep this draft after stopping.');
      assert.equal(await indicator.count(), 0);
      await capture(page, `${out}/${size}-${theme}-stopped.png`);
      await button('Show offline').click();
      assert.equal(await indicator.count(), 0, 'Offline history does not animate stale work');
      await button('Show waiting').click();
      assert.equal(await indicator.count(), 0, 'A decision replaces generation feedback');
      assert.equal(await button('Allow once').count(), 1);
      assert.equal(await button('Decline').count(), 1);
      await capture(page, `${out}/${size}-${theme}-waiting.png`);
      assert.equal(await page.getByText('Generation design fixture · sent 0', { exact: true }).count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${theme}: one indicator, ordered disclosure, streaming, drafts, Stop, offline and decisions`);
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  await page.goto(fixture.url);
  await page.getByTestId('generation-pulse').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="generation-pulse"]')).opacity === '1');
  assert.equal(await page.getByTestId('conversation-generation').count(), 1);
  console.log(`PASS live Reduce Motion. Screenshots: ${out}`);
} finally {
  await browser?.close(); fixture.close();
}
