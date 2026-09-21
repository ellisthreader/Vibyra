// Settings > Memory as the phone chat's memory, against the backend's routes held in
// memory (tests/preferencesServer.ts): the four parts a person writes about themselves,
// each with its own switch, the summary on its own page, what a chat saved, and what the
// page says when memory is off.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-memory-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/settingsAiFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let activePage;

async function open(width, height, query) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  activePage = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${server.url}/?${query}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"][aria-label="Settings"]')).opacity === '1');
  const button = name => page.getByRole('button', { name, exact: true });
  const box = name => page.getByRole('textbox', { name, exact: true });
  const toggle = name => page.getByRole('switch', { name, exact: true });
  const text = value => page.getByText(value, { exact: true });
  const backend = () => page.evaluate(() => ({ calls: window.aiServer.calls, preferences: window.aiServer.state.preferences }));
  const called = call => until(async () => (await backend()).calls.includes(call), call);
  // Pages cross-fade in 150ms under Reduce Motion; a picture taken sooner shows two at once.
  const settle = () => page.waitForTimeout(400);
  return { page, errors, button, box, toggle, text, backend, called, settle };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const shot = (page, name) => capture(page, `${out}/${size}-${theme}-${name}.png`);
      const { page, errors, button, box, toggle, text, backend, called, settle } = await open(width, height, `page=memory&theme=${theme}`);

      // Every part is there, each with its own switch, and the summary stands in for itself.
      await page.getByRole('heading', { name: 'About you', exact: true }).waitFor();
      for (const part of ['name', 'occupation', 'more about you', 'memory summary']) await toggle(`Use ${part}`).waitFor();
      assert.equal(await box('Name').inputValue(), 'Sam');
      assert.equal(await box('Occupation').inputValue(), 'Indie app developer');
      const preview = button('Edit memory summary');
      assert.match(await preview.innerText(), /I’m building Vibyra/);
      assert.match(await preview.innerText(), /\/ 8,000$/m, 'how far the summary has got');
      // What a chat saved says so, so nothing on the list is a mystery.
      await text('From a chat').waitFor();
      await settle(); await shot(page, 'memory');

      // A part saves when the box is left, and says "Saved" only once the server has it.
      await box('Name').fill('  Ellis   Threader ');
      assert.equal(await text('Saved').count(), 0, 'nothing says Saved while typing');
      await box('Occupation').click();
      await called('POST preferences {"name":"Ellis Threader"}');
      await text('Saved').waitFor();
      assert.equal((await backend()).preferences.name, 'Ellis Threader', 'one line, trimmed');

      // A switch keeps the words and stops them being sent.
      await toggle('Use occupation').click();
      await called('POST preferences {"occupationEnabled":false}');
      assert.equal(await box('Occupation').inputValue(), 'Indie app developer', 'off is not deleted');

      // The summary has a page of its own, and saves on the way back.
      await preview.click();
      await page.getByRole('heading', { name: 'Memory summary', exact: true }).waitFor();
      const editor = box('Memory summary');
      assert.match(await editor.inputValue(), /^I’m building Vibyra/);
      await settle(); await shot(page, 'summary');
      await editor.click();
      await editor.fill('I build Vibyra.\n\nI live in London.');
      // Focused, the box offers Done and hides the footnote, so the keyboard has the page.
      await button('Done').click();
      await text('Saved').waitFor();
      assert.equal((await backend()).preferences.summary, 'I build Vibyra.\n\nI live in London.', 'its lines are kept');
      await button('Back').click();
      await page.getByRole('heading', { name: 'About you', exact: true }).waitFor();
      assert.match(await button('Edit memory summary').innerText(), /I build Vibyra\./, 'the page shows what was written');

      // Memory off: the parts keep their words, none of them can be switched, and it says so.
      await toggle('Use memory').click();
      await called('POST preferences {"memoryEnabled":false}');
      await text('Memory is off. Vibyra won’t read or save anything here.').waitFor();
      for (const part of ['name', 'occupation', 'more about you', 'memory summary']) {
        assert.equal(await toggle(`Use ${part}`).isDisabled(), true, `${part} cannot be switched while memory is off`);
      }
      assert.equal(await box('Name').inputValue(), 'Ellis Threader');
      await settle(); await shot(page, 'memory-off');
      assert.deepEqual(errors, []);
      await page.close();

      // A refusal is shown in the server's own words, under the part that was refused.
      const refused = await open(width, height, `page=memory&theme=${theme}`);
      await refused.box('Name').waitFor();
      await refused.page.evaluate(() => window.aiServer.fail.set('POST preferences',
        { status: 422, error: 'Keep your name to 60 characters.' }));
      await refused.box('Name').fill('n'.repeat(61));
      await refused.box('Occupation').click();
      await refused.text('Keep your name to 60 characters.').waitFor();
      await refused.settle(); await shot(refused.page, 'memory-refused');
      assert.deepEqual(refused.errors, []);
      await refused.page.close();
      console.log(`PASS ${size}/${theme}: parts, saving, switches, summary page, memory off, refusal.`);
    }
  }
  // An empty memory offers to be written rather than showing an empty box.
  const fresh = await open(390, 844, 'page=summary&who=nobody');
  await fresh.text('Sign in to use Memory.').waitFor();
  assert.deepEqual((await fresh.backend()).calls, [], 'nobody to ask for: the server is never asked');
  assert.deepEqual(fresh.errors, []);
  await fresh.page.close();
  console.log('PASS the summary page offers the sign-in when there is nobody to ask for.');
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.close();
}
