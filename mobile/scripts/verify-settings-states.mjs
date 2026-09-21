// Settings in the sample workspace, through the real demo workspace: the Test button's
// account shows every row and every page works in memory — Personality, Memory, the
// photo (also on the rail's button), Profile, Security, Subscription and a Delete
// page that explains itself — and a sample opened signed out borrows a stand-in.
// Nothing here may reach a server: every request is recorded and must stay empty.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-settings-states-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/settingsStatesFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let active;

async function open(width, height, query) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  active = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${server.url}/?${query}`);
  const t = {
    page, errors,
    button: name => page.getByRole('button', { name, exact: true }),
    row: name => page.getByRole('button', { name }),
    text: value => page.getByText(value, { exact: true }),
    title: name => page.getByRole('heading', { name, exact: true }),
    called: name => until(() => page.evaluate(value => window.statesCalls.includes(value), name), name),
    network: () => page.evaluate(() => window.statesNetwork),
    // Pages cross-fade under Reduce Motion; a picture taken inside it shows both.
    shot: async name => { await page.waitForTimeout(350); await capture(page, `${out}/${name}.png`); },
    back: async () => { await t.button('Back').click(); await t.title('Settings').waitFor(); },
    gone: () => page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' }),
  };
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return t;
}
async function homeRows(t, rows) { for (const name of rows) await t.row(name).first().waitFor(); }

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const t = await open(width, height, `who=test&theme=${theme}`);
      // The Test button's account is shown as itself, with one quiet line saying it's a test.
      await t.title('Demo account').waitFor();
      await t.text('demo@vibyra.app').waitFor();
      await t.text('Test account · nothing here is saved').waitFor();
      await homeRows(t, [/^Personality, Concise$/, /^Memory, On · 5$/, /^Plugins$/, /^Profile, Demo account, demo@vibyra.app, Free$/, /^Vibyra tokens/,
        /^Subscription, Free$/, /^Security, 2 devices$/, /^Delete account$/, /^Log out$/]);
      await t.shot(`${size}-${theme}-test-home`);
      const walk = (size === 'large') === (theme === 'dark');
      if (walk) {
        // Personality: a style and the instructions, both kept in memory.
        await t.row(/^Personality/).click(); await t.title('Personality').waitFor();
        await t.page.getByRole('radio', { name: 'Friendly', exact: true }).click();
        assert.equal(await t.page.getByRole('radio', { name: 'Friendly', exact: true }).getAttribute('aria-checked'), 'true');
        // Leaving the box saves it (Done only blurs it, and a browser blurs before the click lands).
        const box = t.page.getByRole('textbox', { name: 'Custom instructions', exact: true });
        await box.fill('Short answers, please.'); await box.blur();
        await t.text('Saved').waitFor();
        await t.shot(`${size}-${theme}-test-personality`);
        await t.back(); await t.row(/^Personality, Friendly$/).waitFor();
        // Memory: add one, then remove it.
        await t.row(/^Memory/).click(); await t.title('Memory').waitFor();
        await t.button('Add a memory').click();
        await t.page.getByRole('textbox', { name: 'New memory', exact: true }).fill('Likes dark mode.');
        await t.button('Save memory').click();
        await t.text('Likes dark mode.').waitFor();
        await t.text('6 memories').waitFor();
        await t.shot(`${size}-${theme}-test-memory`);
        await t.button('Remove memory: Likes dark mode.').click();
        await t.text('5 memories').waitFor();
        await t.back(); await t.row(/^Memory, On · 5$/).waitFor();
        // Profile: a new name shows on the row and in the header; the email stays put.
        await t.row(/^Profile/).click(); await t.title('Profile').waitFor();
        const name = t.page.getByRole('textbox', { name: 'Name', exact: true });
        await name.fill('Ellis Test'); await name.press('Enter');
        await t.text('Saved').waitFor();
        await t.text('The sample’s email can’t be changed.').waitFor();
        await t.shot(`${size}-${theme}-test-profile`);
        await t.back(); await t.row(/^Profile, Ellis Test, /).waitFor(); await t.title('Ellis Test').waitFor();
        // Security: two devices, one removed, and a reset that says nothing was sent.
        await t.row(/^Security/).click(); await t.title('Security').waitFor();
        await t.page.getByText('This phone · London, GB', { exact: true }).waitFor();
        t.page.once('dialog', dialog => { void dialog.accept(); });
        await t.button('Remove MacBook Pro').click();
        await t.text('MacBook Pro').waitFor({ state: 'detached' });
        await t.button('Reset password').click();
        await t.text('This is the test account, so no email was sent.').waitFor();
        await t.shot(`${size}-${theme}-test-security`);
        await t.back(); await t.row(/^Security, 1 device$/).waitFor();
        // Subscription: the sample's free plan, nothing billed, and the way to the plans.
        await t.row(/^Subscription/).click(); await t.title('Subscription').waitFor();
        await t.text('Free').first().waitFor();
        await t.text('Test account · nothing here is saved. Nothing is billed.').waitFor();
        await t.shot(`${size}-${theme}-test-subscription`);
        await t.button('See plans').click(); await t.called('wallet'); await t.gone();
        // Delete: the test account can't be deleted; leaving the sample is what clears it.
        await t.button('Open settings').click();
        await t.button('Delete account').click(); await t.title('Delete account').waitFor();
        await t.page.getByText(/^This is the test account, so it can’t be deleted\./).waitFor();
        await t.shot(`${size}-${theme}-test-delete`);
        await t.button('Leave the sample workspace').click(); await t.called('exitDemo'); await t.gone();
        // …and it does: the name, the removed device and the style are the sample's own again.
        await t.button('Open settings').click();
        await t.title('Demo account').waitFor();
        await homeRows(t, [/^Security, 2 devices$/, /^Personality, Concise$/]);
        // The photo: chosen from a file, shown in the header and on the rail's button, then removed.
        await t.button('Add a profile photo').click();
        const picture = await t.page.screenshot({ clip: { x: 0, y: 0, width: 96, height: 96 } });
        const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.button('Choose photo').click()]);
        await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: picture });
        await t.button('Change profile photo').waitFor();
        await t.shot(`${size}-${theme}-test-photo`);
        await t.button('Close Settings').click(); await t.gone();
        assert.ok(await t.button('Settings').locator('img').count() > 0, 'The rail\'s Settings button shows the photo');
        await t.button('Settings').click();
        await t.button('Change profile photo').click(); await t.button('Remove photo').click();
        await t.button('Add a profile photo').waitFor();
      }
      assert.deepEqual(await t.network(), [], 'The test account never reaches a server');
      assert.deepEqual(t.errors, []);
      await t.page.close();
      console.log(`PASS ${size}/${theme}: test account rows${walk ? ', and every page in memory' : ''}.`);
    }
  }
  // A sample opened signed out borrows a stand-in: Account rows to try, but no Delete and no Log out.
  for (const theme of ['light', 'dark']) {
    const t = await open(390, 844, `who=sample&theme=${theme}`);
    await t.title('Sample account').waitFor();
    await t.text('Nothing here is saved').waitFor();
    await homeRows(t, [/^Personality, Concise$/, /^Memory, On · 5$/, /^Profile, Sample account, /, /^Vibyra tokens/,
      /^Subscription, Free$/, /^Security, 2 devices$/]);
    for (const name of ['Delete account', 'Log out']) assert.equal(await t.button(name).count(), 0, `${name} needs an account`);
    await t.shot(`sample-${theme}-home`);
    await t.row(/^Profile/).click(); await t.title('Profile').waitFor();
    const name = t.page.getByRole('textbox', { name: 'Name', exact: true });
    await name.fill('Sample tester'); await name.press('Enter');
    await t.text('Saved').waitFor();
    await t.back(); await t.row(/^Profile, Sample tester, /).waitFor();
    assert.deepEqual(await t.network(), [], 'The sample never reaches a server');
    assert.deepEqual(t.errors, []);
    await t.page.close();
  }
  console.log('PASS sample signed out: stand-in Account rows, no Delete or Log out, changes in memory.');
  console.log(`Screenshots: ${out}.`);
} catch (error) {
  if (active && !active.isClosed()) {
    await active.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.error('Visible state:', (await active.locator('body').innerText().catch(() => '')).slice(0, 1500));
  }
  throw error;
} finally { await browser.close(); server.close(); }
