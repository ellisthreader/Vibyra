// Settings > Personality and Memory, against the backend's routes held in memory
// (tests/preferencesServer.ts): the home rows answer themselves, a style applies on
// the tap and goes back when refused, instructions say "Saved" only after the server
// has them, memories add/remove/clear, the server's own sentences are shown as they
// are, and a server without the routes gets one calm line instead of controls.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-settings-ai-screenshots';
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
  const radio = name => page.getByRole('radio', { name, exact: true });
  const text = value => page.getByText(value, { exact: true });
  const backend = () => page.evaluate(() => ({ calls: window.aiServer.calls, preferences: window.aiServer.state.preferences,
    memories: window.aiServer.state.memories.map(memory => memory.text) }));
  const called = call => until(async () => (await backend()).calls.includes(call), call);
  const checked = async name => (await radio(name).getAttribute('aria-checked')) === 'true';
  // Pages cross-fade in 150ms under Reduce Motion; a picture taken sooner shows two pages at once.
  const settle = () => page.waitForTimeout(400);
  return { page, errors, button, radio, text, backend, called, checked, settle };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const shot = (page, name) => capture(page, `${out}/${size}-${theme}-${name}.png`);
      const { page, errors, button, radio, text, backend, called, checked, settle } = await open(width, height, `page=home&theme=${theme}`);

      // The two rows lead the Vibyra group and already say what they hold.
      await button('Personality, Concise').waitFor();
      await button('Memory, On · 5').waitFor();
      const [personality, memory, plugins] = await Promise.all([button('Personality, Concise'), button('Memory, On · 5'),
        page.getByRole('button', { name: /^Plugins/ })].map(row => row.boundingBox()));
      assert.ok(personality.y < memory.y && memory.y < plugins.y, 'Personality, then Memory, then Plugins');
      await shot(page, 'home');

      // A style applies on the tap.
      await button('Personality, Concise').click();
      await page.getByRole('heading', { name: 'Personality', exact: true }).waitFor();
      assert.equal(await checked('Concise'), true);
      const box = page.getByRole('textbox', { name: 'Custom instructions', exact: true });
      assert.match(await box.inputValue(), /^I build with Expo and TypeScript/);
      await settle(); await shot(page, 'personality');
      await radio('Friendly').click();
      assert.equal(await checked('Friendly'), true);
      await called('POST preferences {"style":"friendly"}');

      // Refused: the tap goes back and the server's sentence is shown as it is.
      await page.evaluate(() => window.aiServer.fail.set('POST preferences', { status: 500, error: 'Vibyra couldn’t answer just now. Please try again.' }));
      await radio('Detailed').click();
      await text('Vibyra couldn’t answer just now. Please try again.').waitFor();
      await until(() => checked('Friendly'), 'the refused style goes back');
      assert.equal(await checked('Detailed'), false);

      // Instructions: the count appears near the limit, and "Saved" only after the server has them.
      await box.fill('a'.repeat(950));
      await text('950 / 1,000').waitFor();
      assert.equal(await text('Saved').count(), 0, 'nothing says Saved while typing');
      await button('Done').click();
      await text('Saved').waitFor();
      assert.equal((await backend()).preferences.instructions.length, 950);
      await box.fill('Keep diffs small.');
      await button('Done').click();
      await until(async () => (await backend()).preferences.instructions === 'Keep diffs small.', 'the new words are saved');

      // Back to the list: the row already says what changed.
      await button('Back').click();
      await button('Personality, Friendly').waitFor();

      // Memory: the switch, add, remove and clear.
      await button('Memory, On · 5').click();
      await page.getByRole('heading', { name: 'Memory', exact: true }).waitFor();
      await text('5 memories').waitFor();
      await text('Builds Vibyra, an app for coding from your phone.').waitFor();
      await settle(); await shot(page, 'memory');
      const toggle = page.getByRole('switch', { name: 'Use memory', exact: true });
      assert.equal(await toggle.isChecked(), true);
      await toggle.click();
      await called('POST preferences {"memoryEnabled":false}');
      assert.equal(await toggle.isChecked(), false);
      // An empty box offers Cancel, and Cancel puts the row back.
      await button('Add a memory').click();
      await button('Cancel').click();
      await button('Add a memory').click();
      const input = page.getByRole('textbox', { name: 'New memory', exact: true });
      await input.fill('Prefers   dark mode.');
      await input.press('Enter');
      await text('Prefers dark mode.').waitFor();
      await text('6 memories').waitFor();
      await button('Remove memory: Writes in British English.').click();
      await text('5 memories').waitFor();
      assert.equal(await text('Writes in British English.').count(), 0);
      assert.equal((await backend()).memories.includes('Writes in British English.'), false);
      page.once('dialog', dialog => dialog.accept());
      await button('Clear all memories').click();
      await text('Memories').waitFor();
      assert.deepEqual((await backend()).memories, []);
      await button('Back').click();
      await button('Memory, Off').waitFor();
      assert.deepEqual(errors, []);
      await page.close();

      // At the limit, the server's sentence, word for word.
      const limit = await open(width, height, `page=memory&full=1&theme=${theme}`);
      await limit.text('50 memories').waitFor();
      await limit.button('Add a memory').click();
      await limit.page.getByRole('textbox', { name: 'New memory', exact: true }).fill('One more thing.');
      await limit.button('Save memory').click();
      await limit.text('You can keep up to 50 memories. Remove one to add another.').waitFor();
      assert.equal(await limit.text('One more thing.').count(), 0, 'nothing refused is shown as saved');
      await limit.settle(); await shot(limit.page, 'memory-limit');
      assert.deepEqual(limit.errors, []);
      await limit.page.close();

      // A server without the routes: one calm line and Try again, never a control.
      const missing = await open(width, height, `page=personality&server=missing&theme=${theme}`);
      await missing.text('Personality isn’t available yet.').waitFor();
      await missing.button('Try again').waitFor();
      assert.equal(await missing.page.getByRole('radio', { name: 'Concise' }).count(), 0);
      assert.equal(await missing.page.getByRole('textbox').count(), 0);
      await missing.settle(); await shot(missing.page, 'personality-unavailable');
      await missing.button('Back').click();
      await missing.button('Personality').waitFor();
      await missing.button('Memory').waitFor();
      await missing.page.close();

      // No answer at all says why.
      const offline = await open(width, height, `page=memory&server=offline&theme=${theme}`);
      await offline.text('Memory isn’t available yet.').waitFor();
      await offline.text('Vibyra couldn’t be reached. Check your connection and try again.').waitFor();
      await offline.page.close();
      console.log(`PASS ${size}/${theme}: rows, styles, refusal rollback, instructions, memory, limit, unavailable, offline.`);
    }
  }
  // Without an account (a guest session or nobody at all) the rows aren't offered and the
  // server isn't asked: the top of the sheet makes the case for an account instead. A page
  // opened directly still offers the sign-in. The sample's rows are its own, in memory.
  for (const who of ['guest', 'nobody', 'sample']) {
    const view = await open(390, 844, `page=home&who=${who}`);
    if (who === 'sample') {
      await view.page.getByRole('button', { name: /^Plugins/ }).waitFor();
      await view.button('Personality, Concise').waitFor();
      await view.page.getByRole('button', { name: /^Memory/ }).waitFor();
    } else {
      await view.button('Create free account').waitFor();
      for (const name of [/^Personality/, /^Memory/, /^Plugins/]) {
        assert.equal(await view.page.getByRole('button', { name }).count(), 0, `${who}: ${name} is not offered without an account`);
      }
    }
    assert.deepEqual((await view.backend()).calls, [], `${who}: the server is never asked`);
    if (who === 'nobody') {
      assert.deepEqual(view.errors, []);
      await view.page.close();
      const direct = await open(390, 844, 'page=personality&who=nobody');
      await direct.text('Sign in to use Personality.').waitFor();
      await direct.button('Sign in').click();
      await direct.button('Log in').waitFor();
      await direct.button('Close Your Vibyra account').click();
      assert.deepEqual(direct.errors, []);
      await direct.page.close();
      continue;
    }
    if (who === 'sample') {
      // The sample's memories are the mockup's and change in memory only.
      await view.page.getByRole('button', { name: /^Memory/ }).click();
      await view.text('Writes in British English.').waitFor();
      await view.button('Remove memory: Writes in British English.').click();
      await until(async () => (await view.text('Writes in British English.').count()) === 0, 'sample memory removed');
      assert.deepEqual((await view.backend()).calls, [], 'sample: removing a memory stays on the phone');
    }
    assert.deepEqual(view.errors, []);
    await view.page.close();
  }
  console.log('PASS rows show for an account and the sample (in memory); a guest and nobody get the sign-up instead, and ask no server.');
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.close();
}
