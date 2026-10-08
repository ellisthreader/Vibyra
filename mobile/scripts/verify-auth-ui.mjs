import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-auth-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true });
const url = process.env.VIBYRA_URL ?? 'http://127.0.0.1:8081';
try {
  for (const [device, width, height] of [['compact', 375, 667], ['iphone', 393, 852], ['large', 430, 932], ['desktop', 1280, 900]]) {
    for (const colorScheme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; let completed = false; let providerCalls = 0;
      page.on('pageerror', error => errors.push(error.message));
      const account = { email: 'qa@example.test', name: 'QA', plan: 'free' };
      // Isolated backend fixtures: this verification never creates or signs into a real account.
      await context.route('**/api/auth/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const payload = path.endsWith('/start') ? { ok: true, flowId: 'test-flow', authUrl: 'https://accounts.google.com/test-auth' }
          : path.includes('/status/') ? (completed ? { ok: true, status: 'complete', token: 'test-token', user: account }
            : { ok: true, status: 'pending' })
          : { ok: false, error: 'Email or password is incorrect.' };
        if (path.endsWith('/start')) providerCalls++;
        await route.fulfill({ status: payload.ok ? 200 : 401, json: payload });
      });
      await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Provider test fixture</p>' }));
      await page.goto(url);
      await page.getByRole('button', { name: 'Get started', exact: true }).click();
      for (const provider of ['Apple', 'Google']) await page.getByRole('button', { name: `Continue with ${provider}`, exact: true }).waitFor();
      await capture(page, `${out}/${device}-${colorScheme}-signup.png`);
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill('qa@example.test');
      await page.getByRole('textbox', { name: 'Email', exact: true }).press('Enter');
      assert.equal(await page.getByLabel('Password', { exact: true }).evaluate(node => node === document.activeElement), true);
      await page.getByLabel('Password', { exact: true }).fill('short');
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      await page.getByRole('button', { name: 'Hide password', exact: true }).waitFor();
      assert.notEqual(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.getByRole('alert').getByText('Enter a valid email and a password with at least 8 characters.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), '');
      assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill('');
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).scrollIntoViewIfNeeded();
      await capture(page, `${out}/${device}-${colorScheme}-login.png`);
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill('qa@example.test');
      await page.getByLabel('Password', { exact: true }).fill('test-password');
      await page.setViewportSize({ width, height: 430 });
      await page.getByRole('button', { name: 'Log in', exact: true }).scrollIntoViewIfNeeded();
      await capture(page, `${out}/${device}-${colorScheme}-keyboard.png`);
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.getByRole('alert').getByText('Email or password is incorrect.', { exact: true }).waitFor();
      await page.setViewportSize({ width, height });
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await popup;
      await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Continue with Apple', exact: true }).getAttribute('aria-disabled'), 'true');
      await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="Continue with Google"]')?.getAttribute('aria-disabled') !== 'true');
      assert.equal(await page.getByRole('alert').count(), 0, 'Cancellation is not an error');
      completed = true;
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await page.getByRole('heading', { name: 'How do you want to code?', exact: true }).waitFor();
      assert.equal(providerCalls, 2);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${device}/${colorScheme}: sign-up/login, focus, password toggle, errors, keyboard, provider cancellation and successful session.`);
    }
  }
  // The dev-only test button: it signs in to the demo account, opens the sample workspace and logs back out,
  // and it must do all of that without asking the backend for a session.
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = []; const authCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/(auth|session)/.test(request.url())) authCalls.push(request.url()); });
  await page.goto(url);
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  // The sample workspace opens in Ideas, the phone's own chat. It used to be
  // switched off there, so signing in with the test button lost the chat the app
  // is mostly made of; now it reads exactly as production does, price included.
  // The empty chat's heading is the full invitation, or the one-line compact one
  // once the keyboard has taken the room (src/vibes/VibesScreen.tsx). The accessible
  // name flattens the line break, so a regex must not look for it.
  await page.getByRole('heading', { name: /^(From a spark\s+to something real\.|Let’s build something\.)$/ }).waitFor();
  await capture(page, `${out}/demo-account-workspace.png`);
  await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Help me design a simple welcome screen.');
  await page.getByText(/^This reply uses up to \d+ Vibes?$/).waitFor();
  await capture(page, `${out}/demo-account-chat.png`);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('This is the sample workspace, so nothing was sent to a model. Sign in to your own account to run it for real.',
    { exact: true }).waitFor();
  await page.getByText(/^\d+ Vibes? used$/).waitFor();
  await capture(page, `${out}/demo-account-reply.png`);
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  // The Test button's account is shown as itself, with one quiet line saying it is a test.
  await page.getByText('Demo account', { exact: true }).first().waitFor();
  await page.getByText('Test account · nothing here is saved', { exact: true }).waitFor();
  await page.getByText('demo@vibyra.app', { exact: true }).first().waitFor();
  await capture(page, `${out}/demo-account-settings.png`);
  // Log out asks first; this is the answer that goes ahead.
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Get started', exact: true }).waitFor();
  assert.deepEqual(authCalls, [], 'the demo sign-in never asks the backend for a session');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS demo account: the test button signs in offline, opens the sample workspace and logs out to the welcome screen.');
  console.log(`Screenshots: ${out}`);
} finally { await browser.close(); }
