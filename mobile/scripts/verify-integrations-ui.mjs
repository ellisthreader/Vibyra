import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';
import { composerChecks, deviceChecks } from './verify-integrations-checks.mjs';

const out = '/tmp/vibyra-integrations-screenshots'; await mkdir(out, { recursive: true });
const server = await serveFixture('tests/integrationsBrowserFixture.tsx');
const calls = page => page.evaluate(() => window.integrationCalls);
const noKeyForm = async page => {
  assert.equal(await page.getByRole('textbox').count(), 0, 'Provider connecting never asks for a key or Vibyra login');
  assert.equal(await page.getByText(/Paste your|Personal access token|Restricted API key/).count(), 0);
};
let browser;
try {
  browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${server.url}/?theme=${theme}&state=signedout`);
      await page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
      await page.getByRole('button', { name: 'GitHub, not connected' }).click();
      const sheet = page.getByRole('dialog', { name: 'GitHub' });
      await sheet.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
      assert.equal(await sheet.getByText('What Vibyra can see', { exact: true }).count(), 0);
      await capture(page, `${out}/${size}-${theme}-oauth-page.png`);
      await sheet.getByRole('button', { name: 'Access details' }).click();
      for (const point of ['What Vibyra can see', 'What Vibyra can change', 'Where your data goes', 'Your GitHub connection'])
        await sheet.getByText(point, { exact: true }).waitFor();
      await sheet.getByText(/saved to your guest session/).waitFor();
      await sheet.getByRole('link', { name: 'Terms' }).waitFor();
      await sheet.getByRole('link', { name: 'Privacy Policy' }).waitFor();
      await noKeyForm(page);
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), []);
      await capture(page, `${out}/${size}-${theme}-oauth-details.png`);
      await sheet.getByRole('button', { name: 'Access details' }).click();
      await sheet.getByRole('button', { name: 'Continue to GitHub' }).click();
      await sheet.getByRole('heading', { name: 'GitHub is connected' }).waitFor();
      await sheet.getByText('Connected as @ellis', { exact: true }).waitFor();
      await noKeyForm(page);
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), ['authorize:github']);
      await capture(page, `${out}/${size}-${theme}-oauth-connected.png`);
      await sheet.getByRole('button', { name: 'Use it in a chat' }).click();
      assert.ok((await calls(page)).includes('use:@github'));
      await page.getByRole('button', { name: 'GitHub, connected' }).waitFor();
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: guest browser flow, disclosure and chat handoff.`);
    }
  }
  for (const state of ['legacy', 'oauth-signedout']) {
    for (const name of ['GitHub', 'Stripe', 'Figma']) {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
      await page.goto(`${server.url}/?state=${state}`);
      await page.getByRole('button', { name: `${name}, not connected` }).click();
      const sheet = page.getByRole('dialog', { name });
      await sheet.getByRole('button', { name: `Continue to ${name}` }).click();
      await sheet.getByRole('heading', { name: `${name} is connected` }).waitFor();
      await noKeyForm(page);
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), [`authorize:${name.toLowerCase()}`]);
      await sheet.getByRole('button', { name: `Disconnect ${name}` }).click();
      await sheet.getByRole('heading', { name: `Connect ${name}` }).waitFor();
      await page.close(); console.log(`PASS ${state}/${name}: browser only, including legacy server catalogues.`);
    }
  }
  for (const state of ['oauth-cancel', 'failure', 'offline', 'unconfigured']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=${state}`);
    await page.getByRole('button', { name: state === 'unconfigured' ? 'GitHub, not available yet' : 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    if (state === 'oauth-cancel' || state === 'failure') {
      await sheet.getByRole('button', { name: 'Continue to GitHub' }).click();
      await sheet.getByText(state === 'oauth-cancel' ? 'You cancelled the sign-in.' : 'GitHub could not be reached. Please try again.', { exact: true }).waitFor();
    } else {
      await sheet.getByRole('button', { name: 'Try again' }).waitFor();
      assert.equal(await sheet.getByRole('button', { name: 'Continue to GitHub' }).count(), 0);
    }
    await noKeyForm(page);
    await capture(page, `${out}/${state}-oauth.png`);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await sheet.waitFor({ state: 'detached' });
    if (state === 'failure') {
      await page.getByRole('button', { name: 'Stripe, not connected' }).click();
      const stripe = page.getByRole('dialog', { name: 'Stripe' });
      await stripe.getByRole('heading', { name: 'Connect Stripe' }).waitFor();
      assert.equal(await stripe.getByText(/GitHub could not be reached/).count(), 0);
    }
    await page.close(); console.log(`PASS ${state}: retryable, no key form or false connection.`);
  }
  for (const state of ['readonly', 'browse']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=${state}`);
    await page.getByRole('button', { name: 'Stripe, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'Stripe' });
    await sheet.getByRole('heading', { name: 'Connect Stripe' }).waitFor();
    await sheet.getByRole('button', { name: 'Access details' }).click();
    assert.equal(await sheet.getByText('What Vibyra can change', { exact: true }).count(), state === 'readonly' ? 0 : 1);
    await page.close();
  }
  await deviceChecks(browser, server, out, calls, noKeyForm);
  await composerChecks(browser, server, out);
  console.log(`Screenshots: ${out}`);
} finally { await browser?.close(); server.close(); }
