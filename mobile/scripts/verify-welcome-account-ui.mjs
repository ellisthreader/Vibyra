import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-welcome-account-screenshots';
const url = process.env.VIBYRA_URL ?? 'http://127.0.0.1:8081';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] });
try {
  for (const [name, width, height, colorScheme, mode] of [
    ['compact-dark', 375, 667, 'dark', 'login'], ['large-light', 430, 932, 'light', 'signup'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
    const user = { email: 'qa@example.test', name: 'QA', plan: 'free' };
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const auth = path === '/api/auth/login' || path === '/api/auth/signup';
      const session = path === '/api/session';
      const logout = path === '/api/auth/logout';
      return route.fulfill({ status: auth || session || logout ? 200 : 404,
        json: auth ? { ok: true, token: 'fixture-account', user }
          : session ? { ok: true, user }
            : logout ? { ok: true }
              : { ok: false, error: 'Fixture endpoint unavailable.' } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = label => page.getByRole('button', { name: label, exact: true });
    await page.goto(url);
    await button('Create account').waitFor();
    await button('Sign in').waitFor();
    assert.equal(await button('Continue without an account').count(), 0);
    await capture(page, `${out}/${name}-welcome.png`);
    await button('Sign in').click();
    await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    assert.equal(await button('Skip for now').count(), 0);
    await button('Back').click();
    await button('Create account').click();
    await page.getByRole('heading', { name: 'Create your account', exact: true }).waitFor();
    assert.equal(await button('Skip for now').count(), 0);
    if (mode === 'login') { await button('Back').click(); await button('Sign in').click(); }
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('longenough');
    await button(mode === 'login' ? 'Log in' : 'Create account').click();
    await page.getByRole('heading', { name: 'How do you want to code?', exact: true }).waitFor();
    await button('Skip — I’ll decide later').click();
    await button('Open navigation menu').waitFor();
    await capture(page, `${out}/${name}-signed-in.png`);
    await button('Decline').click();
    await button('Open navigation menu').click();
    await button('Settings').click();
    await page.getByRole('button', { name: /^Account,/ }).click();
    page.once('dialog', dialog => { void dialog.accept(); });
    await button('Log out').click();
    await button('Create account').waitFor();
    assert.equal(await button('Open navigation menu').count(), 0);
    await page.reload();
    await button('Sign in').waitFor();
    assert.equal(await button('Open navigation menu').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${name}: account required at launch, ${mode}, logout and relaunch.`);
  }
  console.log(`Screenshots: ${out}`);
} finally { await browser.close(); }
