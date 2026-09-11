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
      // The mark is what the page opens on, not a paragraph.
      await sheet.getByRole('heading', { name: 'Reads' }).waitFor();
      // Nothing labels the logo with the name already at the top of the sheet.
      assert.equal(await sheet.getByText('@github', { exact: true }).count(), 0,
        'The page carries no @mention pill; the footer button inserts it instead');
      // What it can see is on the page before anything is connected, not after.
      await sheet.getByText(/^Repository names, issues/).waitFor();
      // Opening the destination asks the server again, so a switch turned on since
      // the app started is seen; the first fetch is the provider's own.
      assert.ok((await calls(page)).filter(call => call === 'catalogue').length >= 2, 'Opening Integrations asks the server again');
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), [], 'Reading an integration page never connects it');
      await capture(page, `${out}/${size}-${theme}-page.png`);

      await sheet.getByRole('button', { name: 'Connect GitHub' }).click();
      const key = sheet.getByRole('textbox', { name: 'GitHub personal access token' });
      await key.fill('nonsense');
      await sheet.getByRole('button', { name: 'Connect', exact: true }).click();
      await sheet.getByText('That token did not work. Check it has not expired and try again.', { exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-refused.png`);

      await key.fill('github_pat_example');
      await sheet.getByRole('button', { name: 'Connect', exact: true }).click();
      await sheet.getByText('Connected as @ellis', { exact: true }).waitFor();
      assert.deepEqual((await calls(page)).filter(call => call !== 'catalogue'), ['connect:github', 'connect:github']);
      await capture(page, `${out}/${size}-${theme}-connected.png`);

      // The payoff: the page hands you straight to a chat with the mention typed.
      await sheet.getByRole('button', { name: 'Use it in a chat' }).click();
      assert.ok((await calls(page)).includes('use:@github'), 'Connecting leads to using it');
      await page.getByRole('button', { name: 'GitHub, connected' }).waitFor();
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: browse, page, refusal, connect and hand-off.`);
    }
  }

  // A refused key belongs to the page it was pasted on. It used to be shared, so
  // GitHub's "that token did not work" was printed on Stripe's page as well.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/`);
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const github = page.getByRole('dialog', { name: 'GitHub' });
    await github.getByRole('button', { name: 'Connect GitHub' }).click();
    await github.getByRole('textbox', { name: 'GitHub personal access token' }).fill('nonsense');
    await github.getByRole('button', { name: 'Connect', exact: true }).click();
    await github.getByText(/^That token did not work/).waitFor();
    await github.getByRole('button', { name: 'Close GitHub' }).click();
    await page.getByRole('button', { name: 'Stripe, not connected' }).click();
    const stripe = page.getByRole('dialog', { name: 'Stripe' });
    await stripe.getByRole('heading', { name: 'Reads' }).waitFor();
    assert.equal(await page.getByText(/^That token did not work/).count(), 0, 'Stripe shows GitHub\'s refusal');
    await stripe.getByRole('button', { name: 'Connect Stripe' }).click();
    await stripe.getByRole('textbox', { name: 'Stripe restricted api key' }).waitFor();
    assert.equal(await page.getByText(/^That token did not work/).count(), 0, 'Stripe\'s key form shows GitHub\'s refusal');
    await page.close(); console.log('PASS refusals: one page\'s error never shows on another.');
  }

  // What something can change in your account is its own labelled section, and it
  // is there before anything is connected. An integration that only reads has no
  // such section at all, so its absence is what says "this one only looks".
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/`);
    await page.getByRole('button', { name: 'Stripe, not connected' }).click();
    const stripe = page.getByRole('dialog', { name: 'Stripe' });
    await stripe.getByRole('heading', { name: 'Reads' }).waitFor();
    await stripe.getByRole('heading', { name: 'Changes' }).waitFor();
    await stripe.getByText(/^Creates customer records you ask for/).waitFor();
    // Two lines and no third: the abilities list said the same thing a third time.
    assert.equal(await stripe.getByRole('heading', { name: 'What it can do' }).count(), 0,
      'The page answers with reads and changes, not with a list as well');
    await capture(page, `${out}/stripe-writes.png`);

    await page.close();

    // Everything we ship can change something, so the other half is proved against
    // a catalogue with `writes` cleared: the heading has to go, not print over nothing.
    const readonly = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await readonly.goto(`${server.url}/?state=readonly`);
    await readonly.getByRole('button', { name: 'Stripe, not connected' }).click();
    const plain = readonly.getByRole('dialog', { name: 'Stripe' });
    await plain.getByRole('heading', { name: 'Reads' }).waitFor();
    assert.equal(await plain.getByRole('heading', { name: 'Changes' }).count(), 0,
      'An integration that only reads carries no "changes" half');
    await readonly.close(); console.log('PASS writes: disclosed where there are any, absent where there are none.');
  }

  // The sample workspace has no account to connect to. It used to say
  // "not switched on for this account", which sent a person looking for a server
  // switch that was already on; it has to name the sample workspace and the way out.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=sample`);
    await page.getByText(/^You are in the sample workspace, so nothing here can be connected\./).waitFor();
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    await sheet.getByText(/^This is the sample workspace, so nothing can be connected here\./).waitFor();
    assert.equal(await sheet.getByText('Integrations are not switched on for this account yet.').count(), 0,
      'The sample workspace must not blame a server switch');
    assert.equal(await sheet.getByRole('button', { name: /^Connect/ }).count(), 0,
      'Nothing offers to connect inside the sample workspace');
    await capture(page, `${out}/sample.png`);
    // The way out is on the page itself, not only in Settings.
    await sheet.getByRole('button', { name: 'Leave sample workspace' }).click();
    assert.ok((await calls(page)).includes('leave-sample'), 'Leave sample workspace leaves it');
    await page.close(); console.log('PASS sample: names the sample workspace and the way out.');
  }

  // Signed out, the page offers sign-in before a key rather than refusing a pasted
  // one, and the form swaps into the same sheet: a second modal over a live one is
  // the iOS race this codebase has been bitten by.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=signedout`);
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
    await sheet.getByRole('heading', { name: 'Reads' }).waitFor();
    await sheet.getByRole('button', { name: 'Sign in to connect GitHub' }).click();
    await sheet.getByText('Fixture sign-in form', { exact: true }).waitFor();
    // react-native-web wraps a sheet in an unnamed dialog of its own, so what is
    // counted is named sheets: GitHub's must still be the only one on screen.
    const named = await page.getByRole('dialog').evaluateAll(els => els.map(e => e.getAttribute('aria-label')).filter(Boolean));
    assert.deepEqual(named, ['GitHub'], 'Sign-in opens inside the same sheet, not over it');
    assert.equal(await sheet.getByRole('button', { name: /^Connect/ }).count(), 0, 'No key is asked for before sign-in');
    await capture(page, `${out}/signed-out.png`);
    await sheet.getByRole('button', { name: 'Finish sign-in' }).click();
    await sheet.getByRole('heading', { name: 'Reads' }).waitFor();
    await page.close(); console.log('PASS signed out: sign-in first, in the same sheet.');
  }

  // A server that cannot be reached says so, rather than showing nothing connected.
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=offline`);
    await page.getByText('Could not reach Vibyra. Check your connection and try again.', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'GitHub, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'GitHub' });
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
