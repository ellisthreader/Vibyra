// Mac-style category navigation on a phone, with the existing controls behind it.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-settings-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/settingsFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let active;

async function phone(width, height, state, theme, extra = '') {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  active = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.url}/?state=${state}&theme=${theme}${extra}`);
  const button = name => page.getByRole('button', { name, exact: true });
  const category = name => page.getByRole('button', { name: new RegExp(`^${name},`) });
  const title = name => page.getByRole('heading', { name, exact: true }).first();
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"][aria-label="Settings"]')).opacity === '1');
  return { page, errors, button, category, title,
    open: async () => {
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' });
      await button('Open settings').click(); await title('Settings').waitFor();
    },
    back: async () => { await button('Back').click(); await title('Settings').waitFor(); },
    called: name => until(() => page.evaluate(value => window.settingsCalls.includes(value), name), name) };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const t = await phone(width, height, 'signedin', theme);
      const { page, button, category, title } = t;
      const box = await page.getByRole('dialog', { name: 'Settings' }).boundingBox();
      assert.ok(box && box.y >= 40 && Math.abs(box.y + box.height - height) <= 1);
      for (const name of ['General', 'Accounts', 'Notifications', 'Computer', 'Account', 'Help', 'Advanced'])
        await category(name).waitFor();
      assert.equal(await page.getByText('Not signed in', { exact: true }).count(), 0);
      await capture(page, `${out}/${size}-${theme}-home.png`);
      // The same find field filters into a page, including the named Codex account.
      await page.getByRole('textbox', { name: 'Find a setting' }).fill('codex');
      await page.getByRole('button', { name: /^OpenAI \/ ChatGPT account/ }).click();
      await title('Accounts').waitFor();
      await page.getByText('ellis@example.com', { exact: true }).waitFor();
      await page.getByText('ChatGPT Pro', { exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-accounts.png`);
      await button('Add').click();
      await t.called('aiAccounts add codex');
      await button('Sign in').click();
      await t.called('aiAccounts connect claude default');
      await button('Install').click();
      await t.called('aiAccounts install gemini');
      page.once('dialog', dialog => dialog.accept());
      await button('Sign out').click();
      await t.called('aiAccounts disconnect codex default');
      await page.getByRole('button', { name: /^Connected services/ }).click();
      await t.called('plugins');
      await t.open();

      await category('General').click();
      const before = await page.getByTestId('fixture-ground').evaluate(element => getComputedStyle(element).backgroundColor);
      await page.getByRole('radio', { name: theme === 'dark' ? 'Light' : 'Dark', exact: true }).click();
      const after = await page.getByTestId('fixture-ground').evaluate(element => getComputedStyle(element).backgroundColor);
      assert.notEqual(after, before, 'Theme repaints the app');
      await page.getByRole('radio', { name: 'Teal', exact: true }).click();
      await t.called('accent teal');
      await t.back();

      await category('Computer').click();
      await button('Larger terminal text').click();
      await t.called('size 14');
      await t.back();

      await category('Account').click();
      await page.getByText('ellis@example.com', { exact: true }).waitFor();
      await button('Vibyra tokens, 1,240').click();
      await title('Vibyra tokens').waitFor();
      await button('Back').click();
      await title('Account').waitFor();
      page.once('dialog', dialog => dialog.dismiss());
      await button('Log out').click();
      assert.equal(await page.evaluate(() => window.settingsCalls.includes('logOut')), false);
      await t.back();

      await category('Help').click();
      await page.getByRole('link', { name: 'Help & guides' }).click();
      await until(() => page.evaluate(() => window.settingsCalls.some(call => call.includes('/#faq'))), 'help link');
      await t.back();
      assert.deepEqual(t.errors, []);
      await page.close();
      console.log(`PASS ${size}/${theme}: Mac tiles, filter, AI account, theme, computer, account and help.`);
    }
  }
  const guest = await phone(390, 844, 'signedout', 'dark');
  const entry = guest.page.getByTestId('guest-account-entry');
  await guest.title('Your account').waitFor();
  const promptBox = await entry.boundingBox();
  const searchBox = await guest.page.getByRole('textbox', { name: 'Find a setting' }).boundingBox();
  assert.ok(promptBox && searchBox && promptBox.y < searchBox.y, 'guest account entry leads Settings');
  assert.equal(await entry.evaluate(node => getComputedStyle(node).borderTopWidth), '0px', 'guest account actions have no enclosing card');
  for (const name of ['General', 'Help', 'Advanced']) await guest.category(name).waitFor();
  for (const name of ['Accounts', 'Notifications', 'Computer', 'Account'])
    assert.equal(await guest.category(name).count(), 0, `${name} is hidden from a guest`);
  await capture(guest.page, `${out}/guest-dark-home.png`);
  await guest.button('Sign in to Vibyra').click();
  const accountForm = guest.page.getByRole('dialog', { name: 'Your Vibyra account' });
  await accountForm.getByRole('button', { name: 'Log in', exact: true }).waitFor();
  await guest.button('Close Your Vibyra account').click();
  await guest.button('Create a Vibyra account').click();
  await accountForm.getByRole('button', { name: 'Create account', exact: true }).waitFor();
  await guest.button('Close Your Vibyra account').click();
  const find = guest.page.getByRole('textbox', { name: 'Find a setting' });
  for (const hidden of ['codex', 'ai accounts', 'integrations', 'computer', 'notifications',
    'account', 'profile', 'security', 'tokens', 'memory']) {
    await find.fill(hidden);
    await guest.page.getByText('No setting matches.').waitFor();
  }
  await find.fill('appearance');
  await guest.page.getByRole('button', { name: /^Theme and accent/ }).waitFor();
  await find.fill('');
  await guest.category('General').click();
  await guest.page.getByText('Appearance', { exact: true }).waitFor();
  assert.equal(await guest.button('Personality').count(), 0);
  assert.equal(await guest.button('Memory').count(), 0);
  await guest.back();
  await guest.category('Help').click();
  await guest.button('Report a problem').waitFor();
  await guest.back();
  await guest.category('Advanced').click();
  await guest.button('App updates').waitFor();
  assert.deepEqual(guest.errors, []);
  await guest.page.close();
  const compactGuest = await phone(375, 667, 'signedout', 'light');
  await compactGuest.button('Sign in to Vibyra').waitFor();
  await compactGuest.category('Help').waitFor();
  await capture(compactGuest.page, `${out}/guest-compact-light-home.png`);
  assert.equal(await compactGuest.category('Account').count(), 0);
  assert.deepEqual(compactGuest.errors, []);
  await compactGuest.page.close();
  const sample = await phone(390, 844, 'sample', 'dark');
  await sample.button('Create a Vibyra account').waitFor();
  assert.equal(await sample.category('Account').count(), 0);
  assert.equal(await sample.category('Accounts').count(), 0);
  await sample.category('General').click();
  await sample.button('Personality').waitFor();
  await sample.page.close();
  const device = await phone(390, 844, 'signedin', 'dark', '&codex=device');
  await device.category('Accounts').click();
  await device.page.getByText('ABCD-EFGHJ', { exact: true }).waitFor();
  await device.button('Open on iPhone').click();
  await device.called('aiAccounts signInUrl codex default');
  await device.page.close();
  console.log('PASS Codex device authorization: phone code and secure page action.');
  const readOnly = await phone(390, 844, 'signedin', 'dark', '&manage=0');
  await readOnly.category('Accounts').click();
  await readOnly.page.getByText('ellis@example.com', { exact: true }).waitFor();
  assert.equal(await readOnly.button('Sign out').isDisabled(), true);
  await readOnly.page.getByText(/Turn on Typing from your phone/).first().waitFor();
  await readOnly.page.close();
  const oldMac = await phone(390, 844, 'signedin', 'dark', '&accounts=0');
  await oldMac.category('Accounts').click();
  await oldMac.page.getByText('Update Vibyra on this Mac to manage its AI accounts.').waitFor();
  await oldMac.page.close();
  console.log('PASS view-only and older-Mac account states.');
  console.log(`Screenshots: ${out}`);
} catch (error) {
  if (active && !active.isClosed()) {
    await active.screenshot({ path: `${out}/failure.png` });
    console.error('Visible state:', await active.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); server.close(); }
