// Settings' account pages, driven through a real WorkspaceStore against a pretend
// server: the profile photo (menu, upload, remove), Profile (name saves, email
// confirmation), Security (devices, remove one, reset email, sign out everywhere) and
// Delete account (a wrong then right password, and a Google deletion polled to done).
// Two phone sizes, both themes; every page is checked for sideways scrolling.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture, until } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-settings-account-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/settingsAccountFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let activePage;

async function open(width, height, query) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  activePage = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // confirmAction asks with window.confirm in a browser; every confirmation here is accepted.
  page.on('dialog', dialog => void dialog.accept());
  await page.goto(`${server.url}/?${query}`);
  const button = name => page.getByRole('button', { name, exact: true });
  const title = name => page.getByRole('heading', { name, exact: true });
  const calls = () => page.evaluate(() => window.accountCalls);
  const called = entry => until(async () => (await calls()).includes(entry), entry);
  const closed = () => page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' });
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return { page, errors, button, title, calls, called, closed };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      // The sheet fades in too, so every picture waits for it to be fully drawn.
      const shot = async (page, name) => {
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"][aria-label="Settings"]')).opacity === '1');
        await capture(page, `${out}/${size}-${theme}-${name}.png`);
      };
      const q = extra => `theme=${theme}&${extra}`;

      // Home: the profile card (name, email and plan), Vibyra tokens, Subscription and Security, which counts devices
      // once they load, then Delete account alone and in red.
      let t = await open(width, height, q(''));
      await t.button('Security, 3 devices').waitFor();
      for (const row of [/^Profile, Ellis, ellis@example.com, Pro 20×$/, /^Vibyra tokens, 1,240$/, /^Subscription, /, /^Delete account$/])
        await t.page.getByRole('button', { name: row }).waitFor();
      // The photo: a browser has no camera, so the menu offers a file and nothing to remove yet.
      await t.button('Add a profile photo').click();
      await t.button('Choose photo').waitFor();
      assert.equal(await t.button('Take photo').count(), 0, 'No camera in a browser');
      assert.equal(await t.button('Remove photo').count(), 0, 'Nothing to remove before there is a photo');
      await shot(t.page, 'photo-menu');
      const picture = await t.page.screenshot({ clip: { x: 0, y: 0, width: 96, height: 96 } });
      const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.button('Choose photo').click()]);
      await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: picture });
      const [uploaded] = await until(() => t.page.evaluate(() => window.accountPhotos.length ? window.accountPhotos : null), 'the upload');
      assert.equal(uploaded.type, 'image/jpeg', 'The photo goes up as a JPEG');
      assert.ok(uploaded.size > 0 && uploaded.size < 2_000_000, 'and small enough for the server to take');
      await t.button('Change profile photo').waitFor();
      await t.page.waitForFunction(() => [...document.querySelectorAll('img')].some(img => img.src.startsWith('blob:') && img.complete));
      await shot(t.page, 'photo');
      await t.button('Change profile photo').click();
      await t.button('Remove photo').click();
      await t.called('DELETE /api/account/avatar');
      await t.button('Add a profile photo').waitFor();
      assert.deepEqual(t.errors, []);
      await t.page.close();

      // Profile: the name saves on Done and says so; an unconfirmed email can ask again.
      t = await open(width, height, q('page=profile&verified=0'));
      await t.title('Profile').waitFor();
      const name = t.page.getByRole('textbox', { name: 'Name', exact: true });
      await name.fill('Ellis Threader');
      await name.press('Enter');
      await t.page.getByText('Saved', { exact: true }).waitFor();
      await t.called('POST /api/account/profile');
      // Return submits and then blurs the box; that is one rename, so one request.
      assert.equal((await t.calls()).filter(call => call === 'POST /api/account/profile').length, 1, 'one save per rename');
      await t.button('Resend confirmation email').click();
      await t.page.getByText('If that email still needs verification, a new link has been sent.', { exact: true }).waitFor();
      await shot(t.page, 'profile');
      // Delete account: a wrong password is refused in the server's words; the right one signs out.
      await t.button('Delete account').click();
      await t.title('Delete account').waitFor();
      // The push is a 150ms cross-fade under Reduce Motion; a picture taken inside it shows both pages.
      await t.page.waitForTimeout(400);
      await t.page.getByText('Deleting your account doesn’t cancel an App Store subscription. Cancel it there first.').waitFor();
      await shot(t.page, 'delete');
      const password = t.page.getByLabel('Password', { exact: true });
      await password.fill('not-it');
      await t.button('Delete account').click();
      await t.page.getByText('Password is incorrect.', { exact: true }).waitFor();
      await password.fill('right-one');
      await t.button('Delete account').click();
      await t.closed();
      await t.page.getByText('Signed out', { exact: true }).waitFor();
      assert.deepEqual(t.errors, []);
      await t.page.close();

      // Security: devices with "This phone", remove another, a reset link, then sign out everywhere.
      t = await open(width, height, q('page=security'));
      await t.title('Security').waitFor();
      await t.page.getByText('This phone · London, GB', { exact: true }).waitFor();
      await t.page.getByText('Active 3 hours ago · London, GB', { exact: true }).waitFor();
      assert.equal(await t.button('Remove iPhone').count(), 0, 'This phone leaves through Log out, not here');
      await shot(t.page, 'security');
      await t.button('Remove MacBook Pro').click();
      await t.called('DELETE /api/account/devices/mac');
      await t.page.getByText('MacBook Pro', { exact: true }).waitFor({ state: 'detached' });
      await t.button('Reset password').click();
      await t.page.getByText('We’ve emailed a reset link to ellis@example.com.', { exact: true }).waitFor();
      await t.button('Sign out of all devices').click();
      await t.closed();
      await t.called('DELETE /api/account/sessions');
      await t.page.getByText('Signed out', { exact: true }).waitFor();
      assert.deepEqual(t.errors, []);
      await t.page.close();

      // A Google account is deleted by signing in with Google again, polled until the server says so.
      t = await open(width, height, q('provider=google&page=delete'));
      await t.page.getByText('Confirm it’s you', { exact: true }).waitFor();
      await shot(t.page, 'delete-google');
      await t.button('Continue with Google').click();
      await t.called('popup');
      await t.closed();
      const deletion = await t.calls();
      assert.ok(deletion.includes('POST /api/auth/desktop/google/start') && deletion.filter(item => item.includes('/status/')).length >= 2,
        'The deletion was started and polled until it was done');
      await t.page.getByText('Signed out', { exact: true }).waitFor();
      assert.deepEqual(t.errors, []);
      await t.page.close();
      console.log(`PASS ${size}/${theme}: photo, profile, confirmation email, delete by password and by Google, devices and sign-out.`);
    }
  }
} catch (error) {
  if (activePage) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.close();
}
