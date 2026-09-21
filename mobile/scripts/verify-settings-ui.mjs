// The Settings sheet: it rises over the app and stops short of the top, closes every
// way it offers, recolours the app as its theme and accent change, and each row does
// what it says. The fixture holds a made-up account in three states; with VIBYRA_URL
// set, the real app is also walked from the drawer to Integrations and to the wallet.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, fullyVisible, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-settings-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/settingsFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let activePage;

async function phone(width, height, query) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  activePage = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The fixture talks to nothing, so any logged error is ours. The real app also calls
  // the live server, which refuses a local origin, so there only thrown errors count.
  if (query !== null) page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  if (query !== null) await page.goto(`${server.url}/?${query}`);
  const button = name => page.getByRole('button', { name, exact: true });
  const sheet = () => page.getByRole('dialog', { name: 'Settings' });
  // Reduce Motion fades the sheet in, so a picture taken as it appears is half see-through.
  const settled =() => page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"][aria-label="Settings"]')).opacity === '1');
  const called = name => until(() => page.evaluate(value => window.settingsCalls.includes(value), name), name);
  const reset = () => page.evaluate(() => { window.settingsCalls.length = 0; });
  const open = async () => { await button('Open settings').click(); await sheet().waitFor(); };
  const closed = () => sheet().waitFor({ state: 'detached' });
  const colour = locator => locator.evaluate(element => getComputedStyle(element).backgroundColor);
  return { page, errors, button, sheet, settled, called, reset, open, closed, colour };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const { page, errors, button, sheet, settled, called, reset, open, closed, colour } = await phone(width, height, `state=signedin&theme=${theme}`);
      const shot = name => capture(page, `${out}/${size}-${theme}-${name}.png`);
      await sheet().waitFor(); await settled();
      const box = await sheet().boundingBox();
      assert.ok(box && box.y >= 40 && Math.abs(box.y + box.height - height) <= 1, `${size}: the sheet stops short of the top and reaches the bottom`);
      assert.equal(await button('Open settings').count(), 0, 'The app behind the sheet is hidden from assistive tech');
      await page.getByRole('button', { name: 'Plugins, 2 connected', exact: true }).waitFor();
      await page.getByText('ellis@example.com', { exact: true }).waitFor();
      await shot('top');

      // Appearance and accent are radios, and choosing one repaints the app at once.
      const ground = page.getByTestId('fixture-ground');
      const other = theme === 'dark' ? 'Light' : 'Dark';
      const groundBefore = await colour(ground);
      await page.getByRole('radio', { name: other, exact: true }).click();
      assert.equal(await page.getByRole('radio', { name: other, exact: true }).getAttribute('aria-checked'), 'true');
      assert.notEqual(await colour(ground), groundBefore, 'Choosing a theme repaints the app');
      await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
      const action = page.getByTestId('fixture-action-text').locator('..');
      const actionBefore = await colour(action);
      await page.getByRole('radio', { name: 'Teal', exact: true }).click();
      assert.equal(await page.getByRole('radio', { name: 'Teal', exact: true }).getAttribute('aria-checked'), 'true');
      assert.equal(await page.getByRole('radio', { name: 'Cobalt', exact: true }).getAttribute('aria-checked'), 'false');
      assert.notEqual(await colour(action), actionBefore, 'Choosing an accent recolours the app\'s buttons');
      await shot('teal');
      await page.getByRole('radio', { name: 'Cobalt', exact: true }).click();

      // Terminal text steps in whole points and stops at both ends of the readable range.
      for (const [label, end] of [['Larger terminal text', '20'], ['Smaller terminal text', '11']]) {
        for (let step = 0; step < 12 && !(await button(label).isDisabled()); step += 1) await button(label).click();
        assert.equal(await page.getByTestId('terminal-text-size').innerText(), end);
      }

      // Help leaves the app for the site and for mail; the legal links sit under the version.
      await reset();
      for (const [name, url] of [['Help & guides', '/#faq'], ['Contact support', 'mailto:support@vibyra.app'],
        ['Terms', '/legal/terms'], ['Privacy', '/legal/privacy']]) {
        await page.getByRole('link', { name, exact: true }).click();
        await until(() => page.evaluate(value => window.settingsCalls.some(call => call.startsWith('open ') && call.includes(value)), url), name);
      }

      // Log out is alone at the end, reachable by scrolling, and asks before it acts.
      const logOut = button('Log out');
      await logOut.scrollIntoViewIfNeeded();
      await fullyVisible(logOut, page, 'Log out');
      await shot('bottom');
      let question = '';
      page.once('dialog', dialog => { question = dialog.message(); void dialog.dismiss(); });
      await logOut.click();
      await until(() => question, 'the log-out question');
      assert.match(question, /^Log out of Vibyra\?/);
      assert.equal(await page.evaluate(() => window.settingsCalls.includes('logOut')), false, 'Cancelling keeps the account');
      page.once('dialog', dialog => { void dialog.accept(); });
      await logOut.click();
      await called('logOut');

      // Every way out closes it: ×, Escape, and a tap on the dimmed app above it.
      await button('Close Settings').click(); await closed();
      await open(); await page.keyboard.press('Escape'); await closed();
      await open(); await page.mouse.click(Math.floor(width / 2), 20); await closed();
      await open();
      await reset();
      await page.getByRole('button', { name: 'Plugins, 2 connected', exact: true }).click();
      await closed(); await called('plugins'); await called('close');
      // Vibyra tokens is a page inside the sheet: it slides over the list, and Back returns to it.
      await open();
      await page.getByRole('button', { name: 'Vibyra tokens, 1,240', exact: true }).click();
      await page.getByRole('heading', { name: 'Vibyra tokens', exact: true }).waitFor();
      await page.waitForTimeout(400); await shot('plan');
      await button('Back').click();
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Plugins, 2 connected', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${theme}: geometry, hidden app, theme and accent, text size, help links, log out, every way out.`);
    }
  }

  // Signed out: the top is the case for an account, and the list keeps only what a guest
  // can use — the look, the app and help. Nothing that needs an account is offered.
  for (const [width, height] of [[375, 667], [390, 844]]) for (const theme of ['light', 'dark']) {
    const { page, errors, button, sheet, settled, called, reset } = await phone(width, height, `state=signedout&theme=${theme}`);
    await sheet().waitFor(); await settled();
    await page.getByRole('heading', { name: 'Make Vibyra yours', exact: true }).waitFor();
    await fullyVisible(button('Create free account'), page, `${width}: the sign-up button is on the first screen`);
    const hidden = [/^Personality/, /^Memory/, /^Plugins/, /^Vibyra tokens/, /^Profile/, /^Create account/, /^Log out/, /^Smaller terminal/];
    for (const name of hidden) assert.equal(await page.getByRole('button', { name }).count(), 0, `${name} needs an account or a computer`);
    for (const name of ['Appearance', 'App', 'Help']) await page.getByRole('heading', { name, exact: true }).waitFor();
    await capture(page, `${out}/signed-out-${width}-${theme}.png`);
    for (const [offer, form] of [['Create free account', 'Create account'], ['Sign in', 'Log in']]) {
      await button(offer).click(); await button(form).waitFor(); await button('Close Your Vibyra account').click();
    }
    await reset();
    await button('Connect a computer').click();
    await called('connect');
    assert.deepEqual(errors, []);
    await page.close();
  }

  const sample = await phone(390, 844, 'state=sample&theme=dark');
  await sample.sheet().waitFor(); await sample.settled();
  await sample.page.getByText('Sample account', { exact: true }).waitFor();
  assert.equal(await sample.page.getByRole('switch', { name: 'Sample workspace', exact: true }).count(), 0);
  await sample.button('Advanced').click(); await sample.settled();
  const toggle = sample.page.getByRole('switch', { name: 'Sample workspace', exact: true });
  assert.equal(await toggle.isChecked(), true);
  assert.equal(await sample.button('Log out').count(), 0, 'There is no account to log out of');
  await capture(sample.page, `${out}/sample-dark.png`);
  await toggle.click();
  await sample.called('exitDemo');
  assert.deepEqual(sample.errors, []);
  await sample.page.close();
  console.log('PASS signed out and sample: the sign-up leads, account-only rows are hidden, sample switch leaves the sample.');

  const url = process.env.VIBYRA_URL;
  if (url) {
    const app = await phone(390, 844, null);
    await app.page.goto(`${url}/?demo=1`);
    await app.button('Open navigation menu').click();
    await app.page.getByTestId('navigation-drawer').waitFor();
    assert.equal(await app.button('Vibyra tokens').count(), 0, 'The balance lives in Settings, not the rail');
    await app.button('Settings').click();
    await app.sheet().waitFor(); await app.settled();
    assert.ok((await app.sheet().boundingBox()).y >= 40, 'The sheet stops short of the top in the app');
    await capture(app.page, `${out}/app-sheet.png`);
    await app.page.getByRole('button', { name: /^Plugins/ }).click();
    await app.closed();
    await app.page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
    // Vibyra tokens needs an account; the development Test button signs in to the sample one.
    const account = await phone(390, 844, null);
    await account.page.goto(url);
    await account.button('Get started').click();
    await account.button('Test').click();
    await account.page.getByText('Sample workspace', { exact: true }).first().waitFor();
    await account.button('Open navigation menu').click();
    await account.button('Settings').click();
    await account.sheet().waitFor();
    await account.page.getByRole('button', { name: /^Vibyra tokens/ }).click();
    await account.page.getByRole('heading', { name: 'Vibyra tokens', exact: true }).waitFor();
    await account.page.waitForTimeout(400);
    await capture(account.page, `${out}/app-plan.png`);
    await account.button('Back').click();
    await account.page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await account.button('Close Settings').click();
    await account.closed();
    await account.button('Open navigation menu').waitFor();
    assert.deepEqual([...app.errors, ...account.errors], []);
    console.log('PASS app: drawer → Settings sheet → Integrations, and Vibyra tokens as a page in the sheet and back.');
  }
  console.log(`Screenshots: ${out}. Browser checks; drag feel, VoiceOver and the iPhone keyboard remain native checks.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    console.error('Visible state:', await activePage.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); server.close(); }
