import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { serveFixture } from './fixture-server.mjs';
import { capture, fullyVisible } from './ui-test-helpers.mjs';
import { checkEntry, checkUpgrade } from './verify-wallet-checks.mjs';
import { checkPriceRetry, checkCancelled, checkHeld, checkMotion, checkNoStore, checkPartial, checkSignedOut, checkSpent } from './verify-wallet-states.mjs';
import { checkSizes } from './verify-wallet-sizes.mjs';

const out = '/tmp/vibyra-wallet-screenshots'; await mkdir(out, { recursive: true });
const server = await serveFixture('tests/walletBrowserFixture.tsx');
const at = search => `${server.url}/?${search}`;
let browser;
const open = async (search, size = [393, 852]) => {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(at(search));
  await page.getByRole('heading', { name: /Vibes available$/ }).waitFor();
  return { page, errors };
};
try {
  browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  for (const [label, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const { page, errors } = await open(`theme=${theme}`, [width, height]);
      // Vibyra tokens, the Settings page, is the balance and only the balance. It is
      // the heading, not a sentence under one, and nothing on it is for sale by the month.
      await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
      assert.equal(await page.getByText('Get Vibyra Pro').count(), 0, 'a wallet never sells itself as a headline');
      assert.equal(await page.getByRole('radio').count(), 0, 'plans are a page of their own');
      // Nothing qualifies the figure any more. The plan, the renewal and the trial
      // tally were four things to read before learning anything, and the page was
      // reported as confusing with "too much information going on". The plan is
      // named on the rail row and sold on the upgrade page; a trial-chat tally is
      // an accounting detail nobody opened this page to read.
      for (const gone of ['Plan', 'Free', 'Trial chats', 'Renews'])
        assert.equal(await page.getByText(gone, { exact: true }).count(), 0,
          `${gone} is not what qualifies a balance`);
      // Both windows are drawn for every account the backend publishes them for,
      // including this one. They are the shape of the plan, and an account that
      // cannot see them only learns a rate exists when a send is refused.
      assert.equal(await page.getByRole('progressbar').count(), 2,
        'the 5-hour and 7-day windows are what the plan is sold on');
      // "N of M", never "N left": the remainder alone never said what the limit was,
      // which is the only question this block exists to answer.
      await page.getByText('Next 5 hours', { exact: true }).waitFor();
      await page.getByText('60 of 60', { exact: true }).waitFor();
      await page.getByText('Next 7 days', { exact: true }).waitFor();
      await page.getByText('150 of 150', { exact: true }).waitFor();
      // The two prose blocks the page used to end with are gone, and a balance is
      // not read to be told rules that never change. Keep them gone.
      for (const gone of ['How Vibes work', 'What your Free plan includes'])
        assert.equal(await page.getByRole('heading', { name: gone, exact: true }).count(), 0,
          `${gone} is not what a balance is read for`);
      // The page ends at its buttons. The footnote and the store links were cut when
      // it was asked to be as simple as it could be; the paywall keeps the links.
      for (const gone of ['A reply costs what the model costs.', 'Restore Purchases', 'Manage', 'Terms', 'Privacy'])
        assert.equal(await page.getByText(gone, { exact: true }).count(), 0, `${gone} is not on the balance page`);
      // Every window says when it resets, including one with nothing in it yet.
      await page.getByText('Resets every 5 hours', { exact: true }).waitFor();
      await page.getByText('Resets every 7 days', { exact: true }).waitFor();
      const last = await page.getByRole('button', { name: 'Upgrade your plan', exact: true }).boundingBox();
      // The sheet's 24pt under the last button, over the home indicator's 34pt.
      assert.ok(last && height - (last.y + last.height) <= 64, 'the buttons sit at the bottom of the sheet');
      // What must be reachable without scrolling is what the page is for, and the
      // way to the plans it deliberately does not show.
      for (const [what, at] of [['the balance', page.getByRole('heading', { name: '3 Vibes available' })],
        ['the 5-hour window', page.getByText('Next 5 hours', { exact: true })],
        ['the 7-day window', page.getByText('Next 7 days', { exact: true })],
        ['the upgrade', page.getByRole('button', { name: 'Upgrade your plan', exact: true })]])
        await fullyVisible(at, page, what);
      await capture(page, `${out}/${label}-${theme}-balance.png`);
      await checkUpgrade(page, { label, theme, width, height, out });
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${label}/${theme}: the balance leads, the plans are a page away, purchase hands back.`);
    }
  }
  await checkEntry(browser, at, out);
  await checkHeld(open, capture, out);
  await checkNoStore(open, capture, out);
  await checkMotion(browser, `${server.url}/`, capture, out);
  await checkSizes(browser, `${server.url}/`, capture, out);
  await checkCancelled(open);
  await checkPriceRetry(open);
  await checkSignedOut(browser, at, capture, out);
  await checkSpent(open, capture, out);
  await checkPartial(open, capture, out);
  console.log(`Screenshots: ${out}`);
} finally { await browser?.close(); server.close(); }
