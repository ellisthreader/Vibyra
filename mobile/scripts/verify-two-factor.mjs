// Settings > Security > Two-factor, proved the way a person would: the QR code on
// screen is decoded from a screenshot with a scanner that knows nothing about this
// app, the secret it carries is turned into a real six-digit code, and that code is
// typed in. Then the recovery codes, turning it off again, and the login it gates.
// Two phone sizes, both themes; every page is checked for sideways scrolling.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import jsQR from 'jsqr';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-two-factor-screenshots';
await mkdir(out, { recursive: true });
const server = await serveFixture('tests/twoFactorFixture.tsx');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let activePage;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** The same arithmetic an authenticator app does, so the codes typed below are real. */
function code(secret, drift = 0) {
  const bits = [...secret].map(character => ALPHABET.indexOf(character).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(Date.now() / 30000) + drift, 4);
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[19] & 0x0f;
  return String(mac.readUInt32BE(offset) % 0x80000000 % 1_000_000).padStart(6, '0');
}
/** The QR as a scanner sees it: a screenshot of that element, decoded. */
async function scan(page, locator) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 120, 'the QR code is drawn at a size a phone can read');
  const shot = await page.screenshot({ clip: box });
  const { data, width, height } = await page.evaluate(async source => {
    const image = await createImageBitmap(await (await fetch(source)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height);
    return { data: [...pixels.data], width: pixels.width, height: pixels.height };
  }, `data:image/png;base64,${shot.toString('base64')}`);
  return jsQR(Uint8ClampedArray.from(data), width, height)?.data ?? null;
}

async function open(width, height, query) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  activePage = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${server.url}/?${query}`);
  const button = name => page.getByRole('button', { name, exact: true });
  const title = name => page.getByRole('heading', { name, exact: true });
  const calls = () => page.evaluate(() => window.accountCalls);
  const secret = () => page.evaluate(() => window.twoFactor.secret);
  const type = async digits => page.getByRole('textbox', { name: 'Six-digit code' }).fill(digits);
  return { page, errors, button, title, calls, secret, type };
}

try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['light', 'dark']) {
      const shot = async (page, name) => capture(page, `${out}/${size}-${theme}-${name}.png`);
      const q = extra => `theme=${theme}&${extra}`;

      // Security says where two-factor stands before it is opened.
      let t = await open(width, height, q('page=security'));
      await t.title('Security').waitFor();
      await t.button('Two-factor authentication, off').waitFor();
      await shot(t.page, 'security');

      // The case for it, then the setup: an authenticator to open, a QR, and the key.
      await t.button('Two-factor authentication, off').click();
      await t.title('Two-factor').waitFor();
      await t.page.getByText('A second step to sign in', { exact: true }).waitFor();
      await shot(t.page, 'off');
      await t.button('Turn on two-factor').click();
      await t.page.getByText('Enter the code from your app', { exact: true }).waitFor();
      // A browser knows of no authenticator app, so the QR leads, which is right there.
      assert.equal(await t.button('Open my authenticator app').count(), 0, 'no app to open in a browser');
      await shot(t.page, 'setup');

      // The QR is decoded from the pixels, and carries exactly the key shown beside it.
      const secret = await t.secret();
      const scanned = await scan(t.page, t.page.getByRole('img', { name: 'Setup code for ellis@example.com' }));
      assert.ok(scanned, 'the QR code on screen can be read by a scanner');
      const uri = new URL(scanned.replace('otpauth://', 'https://'));
      assert.equal(uri.searchParams.get('secret'), secret, 'the QR carries this account’s key');
      assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
      assert.equal(uri.searchParams.get('digits'), '6');
      assert.equal(uri.searchParams.get('period'), '30');
      assert.ok((await t.page.locator('body').innerText()).includes(secret.replace(/(.{4})/g, '$1 ').trim()),
        'and the key beside it is the same one, in fours');

      // A wrong code is refused in the server's words and clears itself for the next try.
      await t.type('000000');
      await t.page.getByText('That code didn’t match. Check your authenticator app and try the current code.').waitFor();
      assert.equal(await t.page.getByRole('textbox', { name: 'Six-digit code' }).inputValue(), '', 'the boxes are ready again');
      await shot(t.page, 'setup-wrong');

      // The real code, worked out from the scanned key, turns it on and shows the codes once.
      await t.type(code(secret));
      await t.page.getByText('Save your recovery codes', { exact: true }).waitFor();
      const codes = (await t.page.locator('body').innerText()).match(/[a-z2-9]{5}-[a-z2-9]{5}/g) ?? [];
      assert.equal(new Set(codes).size, 10, 'ten different recovery codes');
      await t.page.getByText('This is the only time these codes are shown.').waitFor();
      await shot(t.page, 'recovery-codes');
      await t.button('Done').click();
      await t.page.getByText('Recovery codes', { exact: true }).waitFor();
      await t.page.getByText('10 left', { exact: true }).waitFor();
      await shot(t.page, 'on');

      // Turning it off asks for proof that is not the password; a recovery code is proof.
      await t.button('Turn off two-factor').click();
      await t.page.getByText('Enter a code to confirm it’s you. Your password alone will open your account again.').waitFor();
      await shot(t.page, 'turn-off');
      await t.type('123456');
      await t.page.getByText('Enter a code from your authenticator app, or one of your recovery codes.').waitFor();
      await t.button('Use a recovery code instead').click();
      await t.page.getByRole('textbox', { name: 'Recovery code' }).fill(codes[0]);
      await t.button('Turn off').click();
      await t.page.getByText('A second step to sign in', { exact: true }).waitFor();
      assert.deepEqual(t.errors, []);
      await t.page.close();

      // An account that already has it: the login asks the second question.
      t = await open(width, height, q('on=1&signedOut=1'));
      await t.page.getByRole('textbox', { name: 'Email', exact: true }).fill('ellis@example.com');
      await t.page.getByLabel('Password', { exact: true }).fill('secret123');
      await t.button('Log in').click();
      await t.page.getByText('Enter your code', { exact: true }).waitFor();
      await shot(t.page, 'login-code');
      await t.type('000000');
      await t.page.getByText('That code didn’t match. Try the current code from your authenticator app.').waitFor();
      await t.type(code(await t.secret()));
      await t.page.getByText('Signed in as ellis@example.com', { exact: true }).waitFor();
      assert.ok((await t.calls()).includes('POST /api/auth/login/2fa'), 'the code finished the login');
      assert.deepEqual(t.errors, []);
      await t.page.close();

      // A provider account is told where its second step belongs, and offered nothing here.
      t = await open(width, height, q('page=security&provider=google'));
      await t.page.getByText('Managed by Google', { exact: true }).waitFor();
      assert.equal(await t.button('Two-factor authentication, off').count(), 0, 'no second factor Vibyra would never check');
      assert.deepEqual(t.errors, []);
      await t.page.close();
      console.log(`PASS ${size}/${theme}: QR scanned and matched, real code accepted, recovery codes, turn-off and the gated login.`);
    }
  }
} catch (error) {
  if (activePage) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.close();
}
