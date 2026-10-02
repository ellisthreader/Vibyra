import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '../../mobile/node_modules/playwright-core/index.mjs');

const root = resolve(import.meta.dirname, '..'), publicRoot = resolve(root, 'public');
const out = resolve(root, '../output/license-review');
await mkdir(out, { recursive: true });
let pages, account = null, unlocked = false, failCreate = true, twoFactorEnabled = false;
const created = [], redeemed = [], rows = [];
const fixtureKey = 'VPRO-' + Array(8).fill('12345678').join('-');
const user = { id: 123, name: 'License reviewer', email: 'owner@example.test', plan: 'free', emailVerified: true };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (pages?.[path]) { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', pages[path].csp); res.end(pages[path].html); return; }
  if (path.startsWith('/api/') || path.startsWith('/web-api/')) {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const reply = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (path === '/web-api/session') return reply({ user: account });
    if (path === '/web-api/auth/signup') { assert.equal(body.licenseKey, fixtureKey); account = { ...user, licenseRedemptionStatus: 'pending_verification' }; return reply({ user: account }, 201); }
    if (path === '/web-api/owner/2fa/start') {
      if (body.currentPassword === 'wrong-password') return reply({ error: 'That password did not match your Vibyra account. Try again, or reset your password.' }, 403);
      if (body.currentPassword === 'rate-limited') return reply({ message: 'Too Many Attempts.' }, 429);
      assert.equal(body.currentPassword, 'fixture-password');
      return reply({ secret: 'FIXTUREONLY', account: user.email });
    }
    if (path === '/web-api/owner/2fa/confirm') {
      twoFactorEnabled = true; return reply({ recoveryCodes: ['fixture-code'] });
    }
    if (path === '/web-api/owner/verify-2fa') { unlocked = true; return reply({ ok: true }); }
    if (path === '/web-api/owner/licenses') {
      if (!unlocked) return reply({ ok: false, error: 'owner_two_factor_required', enabled: twoFactorEnabled, provider: 'email' }, 428);
      if (req.method === 'GET') return reply({ licenses: rows, page: 1, lastPage: 1, enabled: true, ownerAccessExpiresAt: Date.now() + 600000 });
      created.push(body);
      if (failCreate) { failCreate = false; return reply({ error: 'Fixture lost response' }, 504); }
      rows.push({ id: 'fixture', label: body.label, key_suffix: '12345678', tokens: body.tokens, allowance: body.allowance,
        duration_months: body.duration_months, claim_by: '2027-01-01 12:00:00' });
      return reply({ key: fixtureKey, id: 'fixture', ownerAccessExpiresAt: Date.now() + 600000 }, 201);
    }
    if (path.endsWith('/revoke')) { rows[0].revoked_at = '2026-10-02 12:00:00'; return reply({ ok: true }); }
    if (path === '/web-api/account/license') {
      redeemed.push(body); account = { ...user, plan: 'pro_v2', billingProvider: 'license', membershipActive: true,
        license: { tokens: 300, allowance: 'monthly', endsAt: '2027-01-01T12:00:00Z', nextAt: '2026-11-02T12:00:00Z' } };
      return reply({ ok: true, user: account });
    }
    if (path === '/web-api/owner/analytics' || path === '/web-api/billing/account') return reply({ error: 'Not part of this fixture' }, 503);
    return reply({ ok: true });
  }
  const file = resolve(publicRoot, `.${path}`);
  if (!file.startsWith(publicRoot + '/')) { res.writeHead(404).end(); return; }
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
pages = JSON.parse(execFileSync('php', ['scripts/website-csp-fixture.php', origin], { cwd: root, encoding: 'utf8',
  env: { ...process.env, APP_ENV: 'testing', APP_KEY: `base64:${Buffer.alloc(32, 7).toString('base64')}`,
    DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:', DB_URL: '', SESSION_DRIVER: 'array', CACHE_STORE: 'array' } }));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.clock.install();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/signup`);
  await page.getByText('Have a license key?', { exact: true }).click();
  await page.getByLabel('License key', { exact: true }).fill(fixtureKey);
  await page.getByLabel('Name', { exact: true }).fill('License reviewer');
  await page.getByLabel(/^Email(?: address)?$/).fill('recipient@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  for (const label of [/I agree to/, /I am 18/, /I currently reside/]) if (await page.getByRole('checkbox', { name: label }).count()) await page.getByRole('checkbox', { name: label }).check();
  await page.screenshot({ path: `${out}/signup-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.goto(`${origin}/account`);
  await page.getByText('Verify your email to activate your Pro license.').waitFor();
  await page.getByText('Redeem license', { exact: true }).click();
  await page.getByLabel('License key').fill(fixtureKey);
  await page.getByRole('button', { name: 'Activate Pro' }).click();
  await page.getByText('No recurring payment.').waitFor();
  assert.equal(redeemed[0].expectedAccountId, user.id);
  await page.goto(`${origin}/owner`);
  await page.getByRole('button', { name: /Licenses/ }).first().click();
  await page.getByLabel('Current password').fill('wrong-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.getByLabel('Current password').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: 'Forgot your Vibyra password?' }).getAttribute('href'), '/forgot-password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'That password did not match' }).waitFor();
  await page.getByLabel('Current password').fill('rate-limited');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Too many attempts. Please wait before trying again.' }).waitFor();
  await page.screenshot({ path: `${out}/owner-enrollment-feedback.png`, fullPage: true });
  await page.getByLabel('Current password').fill('fixture-password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Enable protection' }).click();
  await page.getByRole('button', { name: 'I saved my codes · continue to verification' }).click();
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByRole('button', { name: 'Create license', exact: true }).click();
  await page.getByLabel('Internal label').fill('Reviewer Pro');
  await page.getByRole('button', { name: 'Review license', exact: true }).click();
  await page.getByRole('button', { name: 'Create license key', exact: true }).click();
  await page.getByRole('button', { name: 'Check same request' }).click();
  await page.getByRole('heading', { name: 'Save this key now' }).waitFor();
  assert.deepEqual(created[0], created[1]);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).then(s => s.includes(fixtureKey)), false);
  await page.getByRole('cell', { name: /Reviewer Pro/ }).waitFor();
  await page.screenshot({ path: `${out}/owner-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke license', exact: true }).click();
  await page.getByRole('cell', { name: /Revoked/ }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/owner-phone.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.clock.fastForward(601000);
  await page.getByRole('heading', { name: 'Verify to manage licenses' }).waitFor();
  assert.equal(await page.getByText(fixtureKey, { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: website signup, pending verification, account-scoped redemption, owner 2FA, exact creation retry, revocation, no key persistence, responsive layout.');
} finally { await browser.close(); server.close(); }
