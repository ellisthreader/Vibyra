// Settings > Account on sample data, run from `mobile/`:
//   node scripts/verify-desktop-account.mjs
// Bundles the desktop pane with its real stylesheets, answers every command
// locally, and drives it at the width a real window has — 1280, not the
// narrow default a fixture would otherwise hide misalignment behind.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { verifyAccountRecovery } from './verify-desktop-account-recovery.mjs';

const output = resolve('../output/desktop-account');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/accountPaneFixture.tsx'))};`, resolveDir: process.cwd() },
  // The model artwork glob needs `import.meta`, which an iife bundle has no
  // place for; nothing on this page draws a model icon.
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/account.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/account.js`, js.contents);
await writeFile(`${output}/account.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/account.js') ? js : req.url.startsWith('/account.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/account.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/account.css"><div id="root"></div><script src="/account.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const open = async (search) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor().catch(() => {});
  return { page, errors };
};
const last = (page) => page.evaluate(() => window.accountLast());
// The pane scrolls inside the modal, so a shot names the block it is about
// and brings that block to the top first. `instant` because a smooth scroll
// would still be moving when the shutter falls.
const shot = async (page, name, panel = 'identity') => {
  await page.evaluate((target) => {
    document.querySelector(`[data-panel="${target}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, panel);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${output}/${name}.png` });
};

try {
  for (const theme of ['dark', 'light']) {
    const t = theme === 'light' ? 'light&' : '';

    // ── membership, every shape an account can be in ─────────────────────
    const free = await open(`${t}plan=free`);
    await free.page.getByText('Free plan').waitFor();
    await free.page.getByRole('button', { name: 'See plans' }).click();
    assert.deepEqual(await last(free.page), ['account_billing_page', { page: 'plans' }]);
    await shot(free.page, `membership-free-${theme}`, 'membership');
    assert.equal(await free.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    const stripe = await open(`${t}plan=stripe`);
    await stripe.page.getByText('Pro 10× plan').waitFor();
    assert.match(await stripe.page.getByText(/Renews on/).innerText(), /Renews on \d+ \w+ \d{4}/);
    await stripe.page.getByText('Card, through Stripe · Monthly').waitFor();
    await stripe.page.getByRole('button', { name: 'Manage billing' }).click();
    assert.deepEqual((await last(stripe.page))[0], 'account_billing_portal');
    await shot(stripe.page, `membership-stripe-${theme}`, 'membership');

    const annual = await open(`${t}plan=annual`);
    await annual.page.getByText('Card, through Stripe · Yearly').waitFor();

    const cancelling = await open(`${t}plan=cancelling`);
    await cancelling.page.getByText(/Ends on/).waitFor();
    await cancelling.page.getByText('Cancelling').waitFor();
    await shot(cancelling.page, `membership-cancelling-${theme}`, 'membership');

    const store = await open(`${t}plan=appstore`);
    await store.page.getByText(/Paid through/).waitFor();
    // One mark and one word: no sentence about who owns the subscription.
    await store.page.getByText('App Store', { exact: true }).waitFor();
    assert.equal(await store.page.locator('.membership__billed svg').count(), 1, 'the Apple mark carries it');
    assert.equal(await store.page.getByRole('button', { name: 'Manage billing' }).count(), 0,
      'Vibyra never offers to manage what Apple sold');
    await store.page.getByRole('button', { name: 'Open subscriptions' }).click();
    assert.deepEqual(await last(store.page), ['account_billing_page', { page: 'appStore' }]);
    // Plan, balance and billing are one card, and the paid-through date is
    // stated once rather than again as a credit refresh.
    assert.equal(await store.page.locator('[data-panel="membership"] .credits-row').count(), 1,
      'credits share the membership card rather than opening a second one');
    assert.equal(await store.page.getByText(/Refreshes on/).count(), 0,
      'the plan row already said that date');
    await shot(store.page, `membership-appstore-${theme}`, 'membership');

    // ── credits ──────────────────────────────────────────────────────────
    const credits = free.page;
    await credits.getByText('1,284').waitFor();
    await credits.getByText(/Refreshes on/).waitFor();
    await credits.getByText('60 in flight').waitFor();
    assert.match(await credits.getByRole('meter', { name: 'Credits left' }).getAttribute('aria-valuenow'), /^\d+$/);
    await credits.getByRole('button', { name: 'Buy credits' }).click();
    await credits.getByRole('button', { name: /^500 · £20/ }).click();
    assert.deepEqual(await last(credits), ['account_billing_topup', { topup: 'topup_500' }]);

    const quiet = await open(`${t}nochat`);
    assert.equal(await quiet.page.getByRole('button', { name: 'Buy credits' }).count(), 0,
      'nothing is sold while chat is switched off');

    // ── two-factor ───────────────────────────────────────────────────────
    const setup = await open(`${t}2fa=off`);
    await setup.page.getByRole('button', { name: 'Set up' }).click();
    await setup.page.getByText('JBSWY3DPEHPK3PXP').waitFor();
    assert.equal(await setup.page.locator('.two-factor__qr svg').count(), 1);
    await shot(setup.page, `two-factor-setup-${theme}`, 'security');
    await setup.page.getByLabel('Code from your authenticator app').fill('123456');
    await setup.page.getByRole('button', { name: 'Turn on' }).click();
    await setup.page.getByText('4f2a-91bd').waitFor();
    assert.equal(await setup.page.locator('.recovery-codes li').count(), 6);
    await shot(setup.page, `two-factor-codes-${theme}`, 'security');
    await setup.page.getByRole('button', { name: 'Done' }).click();
    await setup.page.getByText('Two-factor authentication is on.').waitFor();

    const on = await open(`${t}2fa=on`);
    await on.page.getByText(/5 recovery codes left/).waitFor();
    await on.page.getByRole('button', { name: 'Turn off' }).click();
    await on.page.getByText(/Enter a code from your authenticator app/).waitFor();
    await on.page.getByLabel('Code from your authenticator app').fill('654321');
    await on.page.getByRole('button', { name: 'Turn off' }).click();
    assert.deepEqual(
      await on.page.evaluate(() => window.accountEvents.find(e => e[0] === 'account_two_factor_disable')),
      ['account_two_factor_disable', { code: '654321' }],
      'turning it off takes a code, never the password',
    );
    assert.equal((await last(on.page))[0], 'account_two_factor_status', 'the row re-reads what it now is');
    await on.page.getByText('Two-factor authentication is off.').waitFor();

    // A Google or Apple account cannot hold a Vibyra code — but it is still
    // told where its second step lives, and taken there.
    const google = await open(`${t}provider=google&2fa=provider`);
    await google.page.getByText(/its second step belongs to Google/).waitFor();
    assert.equal(await google.page.getByRole('button', { name: 'Send reset link' }).count(), 0,
      'a provider account has no Vibyra password to reset');
    await google.page.getByRole('button', { name: 'Set up at Google' }).click();
    assert.deepEqual(await last(google.page), ['account_provider_security', { provider: 'google' }]);
    await shot(google.page, `two-factor-provider-${theme}`, 'security');

    // ── devices ──────────────────────────────────────────────────────────
    const devices = await open(`${t}running`);
    await devices.page.getByText('iPhone 17 Pro').waitFor();
    await devices.page.getByText('This device', { exact: true }).waitFor();
    await devices.page.getByRole('group', { name: 'iPhone 17 Pro' }).getByRole('button', { name: 'Sign out' }).click();
    assert.equal((await devices.page.evaluate(() => window.accountEvents.map(e => e[0]))).includes('account_device_revoke'), true);
    await devices.page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await devices.page.getByText(/This signs out every device/).waitFor();
    assert.match(await devices.page.getByText(/This signs out every device/).innerText(), /1 running terminal/);
    await shot(devices.page, `devices-${theme}`, 'devices');
    await devices.page.getByRole('group', { name: 'Sign out everywhere?' }).getByRole('button', { name: 'Sign out everywhere' }).click();
    assert.deepEqual(await last(devices.page), ['end-session']);

    // ── leaving ──────────────────────────────────────────────────────────
    const danger = await open(`${t}plan=appstore`);
    await danger.page.getByRole('button', { name: 'Delete account' }).click();
    await danger.page.getByText(/your chats, memory and published projects/).waitFor();
    await danger.page.getByText(/Cancel your subscription with Apple/).waitFor();
    await shot(danger.page, `delete-${theme}`, 'danger');
    await danger.page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await danger.page.getByRole('button', { name: 'Delete account' }).click();
    assert.deepEqual(await last(danger.page), ['end-session']);

    const { warnings, offline, code } = await verifyAccountRecovery({ open, t, shot, theme, last });
    for (const { page, errors } of [free, stripe, annual, cancelling, store, quiet, setup, on, google, devices, danger, warnings, offline, code]) {
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('PASS: membership (free, card, yearly, cancelling, App Store), credits and top-ups, two-factor on/off/provider, devices and sign-out everywhere, deletion, keyring and verification warnings, a failed read that says so, and the sign-in code step — both themes at 1280.');
} finally {
  await browser.close();
  server.close();
}
