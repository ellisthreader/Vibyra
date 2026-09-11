import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = '/tmp/vibyra-integrations-screenshots'; await mkdir(out, { recursive: true });
const server = await serveFixture('tests/integrationsBrowserFixture.tsx');
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const calls = page => page.evaluate(() => window.integrationCalls);
let browser;
try {
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${server.url}/?theme=${theme}`);
      await page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
      // The one sentence that has to teach the whole feature.
      await page.getByText('Connect an account, then mention it in a chat.', { exact: true }).waitFor();
      // The list is the services themselves: names and what they do, nothing to
      // decode down the right-hand edge and no worked example above them.
      for (const name of ['GitHub', 'Stripe'])
        await page.getByText(name, { exact: true }).first().waitFor();
      for (const mention of ['@github', '@stripe'])
        assert.equal(await page.getByText(mention, { exact: true }).count(), 0,
          `The list carries no ${mention} pill; the mention lives on the integration's own page`);
      await capture(page, `${out}/${size}-${theme}-browse.png`);

      await page.getByRole('button', { name: 'GitHub, not connected' }).click();
      const sheet = page.getByRole('dialog', { name: 'GitHub' });
      // The card opens on the decision itself: the title is the action.
      await sheet.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
      // The whole disclosure is on the card before anything connects, in plain words.
      for (const point of ['What Vibyra can see', 'What Vibyra can change', 'Where your data goes', 'Your personal access token'])
        await sheet.getByText(point, { exact: true }).waitFor();
      await sheet.getByText(/^Repository names, issues/).waitFor();
      await sheet.getByText(/is sent to the AI provider writing your reply/).waitFor();
      // Tapping Connect is the agreement, so the Terms and Privacy Policy sit right above it.
      await sheet.getByRole('link', { name: 'Terms' }).waitFor();
      await sheet.getByRole('link', { name: 'Privacy Policy' }).waitFor();
      await sheet.getByRole('button', { name: 'Cancel' }).waitFor();
      // Opening the destination asks the server again, so a switch turned on since
      // the app started is seen; the first fetch is the provider's own.
      assert.ok((await calls(page)).filter(call => call === 'catalogue').length >= 2, 'Opening Integrations asks the server again');
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), [], 'Reading the card never connects anything');
      await capture(page, `${out}/${size}-${theme}-page.png`);

      await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
      await sheet.getByRole('heading', { name: 'Paste your personal access token' }).waitFor();
      const key = sheet.getByRole('textbox', { name: 'GitHub personal access token' });
      await key.fill('nonsense');
      await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
      await sheet.getByText('That token did not work. Check it has not expired and try again.', { exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-refused.png`);

      await key.fill('github_pat_example');
      await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
      await sheet.getByRole('heading', { name: 'GitHub is connected' }).waitFor();
      await sheet.getByText('Connected as @ellis', { exact: true }).waitFor();
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), ['connect:github', 'connect:github']);
      await capture(page, `${out}/${size}-${theme}-connected.png`);

      // The payoff: the card hands you straight to a chat with the mention typed.
      await sheet.getByRole('button', { name: 'Use it in a chat' }).click();
      assert.ok((await calls(page)).includes('use:@github'), 'Connecting leads to using it');
      await page.getByRole('button', { name: 'GitHub, connected' }).waitFor();
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: browse, disclosure, refusal, connect and hand-off.`);
    }
  }

  // A refused key belongs to the card it was pasted on: GitHub's "that token did
  // not work" must not follow a person to Stripe. Back and Cancel are the ways out.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/`);
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const github = page.getByRole('dialog', { name: 'GitHub' });
    await github.getByRole('button', { name: 'Connect GitHub' }).click();
    await github.getByRole('textbox', { name: 'GitHub personal access token' }).fill('nonsense');
    await github.getByRole('button', { name: 'Connect GitHub' }).click();
    await github.getByText(/^That token did not work/).waitFor();
    await github.getByRole('button', { name: 'Back' }).click();
    await github.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
    await github.getByRole('button', { name: 'Cancel' }).click();
    await github.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Stripe, not connected' }).click();
    const stripe = page.getByRole('dialog', { name: 'Stripe' });
    await stripe.getByRole('heading', { name: 'Connect Stripe' }).waitFor();
    assert.equal(await page.getByText(/^That token did not work/).count(), 0, 'Stripe shows GitHub\'s refusal');
    await stripe.getByRole('button', { name: 'Connect Stripe' }).click();
    await stripe.getByRole('textbox', { name: 'Stripe restricted api key' }).waitFor();
    assert.equal(await page.getByText(/^That token did not work/).count(), 0, 'Stripe\'s key form shows GitHub\'s refusal');
    await page.close(); console.log('PASS refusals: one card\'s error never shows on another, and Cancel closes it.');
  }

  // What something can change in your account is its own point, before anything is
  // connected. A connector that only reads has no such point at all, so its absence
  // is what says "this one only looks".
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/`);
    await page.getByRole('button', { name: 'Stripe, not connected' }).click();
    const stripe = page.getByRole('dialog', { name: 'Stripe' });
    await stripe.getByRole('heading', { name: 'Connect Stripe' }).waitFor();
    await stripe.getByText('What Vibyra can change', { exact: true }).waitFor();
    await stripe.getByText(/^Creates customer records you ask for/).waitFor();
    assert.equal(await stripe.getByText('What it can do').count(), 0, 'The card answers with its points, not an abilities list as well');
    await capture(page, `${out}/stripe-writes.png`);
    await page.close();

    const readonly = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await readonly.goto(`${server.url}/?state=readonly`);
    await readonly.getByRole('button', { name: 'Stripe, not connected' }).click();
    const plain = readonly.getByRole('dialog', { name: 'Stripe' });
    await plain.getByText('What Vibyra can see', { exact: true }).waitFor();
    assert.equal(await plain.getByText('What Vibyra can change', { exact: true }).count(), 0,
      'A connector that only reads carries no "can change" point');
    await readonly.close(); console.log('PASS writes: disclosed where there are any, absent where there are none.');
  }

  // Signed out, Connect leads to sign-in before any key, and the form swaps into the
  // same card: a second modal over a live one is the iOS race this codebase has been
  // bitten by. Signing in moves straight on to the key.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=signedout`);
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
    await sheet.getByRole('heading', { name: 'Sign in to connect GitHub' }).waitFor();
    await sheet.getByText('Fixture sign-in form', { exact: true }).waitFor();
    // react-native-web wraps a modal in an unnamed dialog of its own, so what is
    // counted is named ones: GitHub's must still be the only one on screen.
    const named = await page.getByRole('dialog').evaluateAll(els => els.map(e => e.getAttribute('aria-label')).filter(Boolean));
    assert.deepEqual(named, ['GitHub'], 'Sign-in opens inside the same card, not over it');
    assert.equal(await sheet.getByRole('button', { name: /^Connect/ }).count(), 0, 'No key is asked for before sign-in');
    await capture(page, `${out}/signed-out.png`);
    await sheet.getByRole('button', { name: 'Finish sign-in' }).click();
    await sheet.getByRole('heading', { name: 'Paste your personal access token' }).waitFor();
    await page.close(); console.log('PASS signed out: sign-in first, in the same card, then the key.');
  }

  // Where the server can send a person to the provider's own sign-in, Connect goes
  // there instead of asking for a key: the system sheet, the provider's page, and
  // back to a connected card. The card says first that the provider may ask for
  // more than Vibyra uses, and a cancel is said as one, on the same card.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=oauth`);
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    await sheet.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
    await sheet.getByText('Your GitHub sign-in', { exact: true }).waitFor();
    await sheet.getByText(/^GitHub may ask to allow more than Vibyra uses/).waitFor();
    await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
    await sheet.getByRole('heading', { name: 'GitHub is connected' }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0, 'A sign-in never asks for a key');
    assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), ['authorize:github']);
    await capture(page, `${out}/oauth-connected.png`);
    await page.close();

    const cancelled = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await cancelled.goto(`${server.url}/?state=oauth-cancel`);
    await cancelled.getByRole('button', { name: 'GitHub, not connected' }).click();
    const card = cancelled.getByRole('dialog', { name: 'GitHub' });
    await card.getByRole('button', { name: 'Connect GitHub' }).click();
    await card.getByText('You cancelled the sign-in.', { exact: true }).waitFor();
    await card.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
    await cancelled.close(); console.log('PASS sign-in: the provider\'s page instead of a key, and a cancel said as one.');
  }

  // A server that cannot be reached says so, rather than showing nothing connected.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=offline`);
    await page.getByText('Could not reach Vibyra. Check your connection and try again.', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    await sheet.getByRole('heading', { name: 'Connect GitHub' }).waitFor();
    await sheet.getByRole('button', { name: 'Cancel' }).waitFor();
    assert.equal(await sheet.getByRole('button', { name: /^Connect/ }).count(), 0,
      'Nothing offers to connect while the catalogue is unknown');
    await capture(page, `${out}/offline.png`);
    await page.close(); console.log('PASS offline: honest, and nothing to tap.');
  }

  // The reference itself: typing `@` offers what is connected, and choosing inserts it.
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.url}/?state=composer&theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('what changed this week');
    assert.equal(await page.getByRole('button', { name: 'Mention GitHub' }).count(), 0,
      'The suggestions appear only while a mention is being typed');
    // Typed rather than filled, because what is under test is what typing does.
    await input.click();
    await input.pressSequentially(' @g');
    await page.getByRole('button', { name: 'Mention GitHub' }).waitFor();
    // Only what is connected is offered: Stripe is not.
    assert.equal(await page.getByRole('button', { name: /^Mention / }).count(), 1);
    await capture(page, `${out}/composer-${theme}-suggesting.png`);
    await page.getByRole('button', { name: 'Mention GitHub' }).click();
    assert.equal(await input.inputValue(), 'what changed this week @github ');
    await capture(page, `${out}/composer-${theme}.png`);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS composer/${theme}: the mention is offered, and inserted.`);
  }
  console.log(`Screenshots: ${out}`);
} finally { await browser?.close(); server.close(); }
