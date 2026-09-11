import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture, fullyVisible } from './ui-test-helpers.mjs';
import { checkCancelled, checkHeld, checkMotion, checkNoStore, checkPartial, checkSignedOut, checkSpent } from './verify-wallet-states.mjs';

const out = '/tmp/vibyra-wallet-screenshots'; await mkdir(out, { recursive: true });
const bundle = await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['tests/walletBrowserFixture.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  alias: { 'react-native': 'react-native-web' },
  // react-native-web's Dimensions and Animated read `global`, which Metro provides
  // and a plain browser bundle does not. Without it every animation throws.
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true', global: 'globalThis' },
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'server-context', setup(b) {
    b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async-hooks', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class AsyncLocalStorage { getStore() { return undefined; } }' }));
  } }],
});
const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}</style><div id="root"></div><script src="/fixture.js"></script>';
const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const open = async (search, size = [393, 852]) => {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?${search}`);
  await page.getByRole('heading', { name: /Vibes available$/ }).waitFor();
  return { page, errors };
};
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const [label, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const { page, errors } = await open(`theme=${theme}`, [width, height]);
      // Page one is the balance and only the balance. It is the heading, not a
      // sentence under one, and nothing on it is for sale by the month.
      await page.getByRole('heading', { name: 'Your Vibes', exact: true }).waitFor();
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
      // What must be reachable without scrolling is what the page is for, and the
      // way to the plans it deliberately does not show.
      for (const [what, at] of [['the balance', page.getByRole('heading', { name: '3 Vibes available' })],
        ['the 5-hour window', page.getByText('Next 5 hours', { exact: true })],
        ['the 7-day window', page.getByText('Next 7 days', { exact: true })],
        ['the upgrade', page.getByRole('button', { name: 'Upgrade your plan', exact: true })]])
        await fullyVisible(at, page, what);
      await capture(page, `${out}/${label}-${theme}-balance.png`);

      // Page two is the plans, and it is one button away.
      await page.getByRole('button', { name: 'Upgrade your plan' }).click();
      await page.getByRole('heading', { name: 'Upgrade', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Get more each month', exact: true }).waitFor();
      // With the balance a page away, the plans would otherwise be priced against
      // nothing, so the one line that says where the account stands has to be here.
      await page.getByText('You are on the Free plan with 3 Vibes.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('radio').count(), 3, 'a free account is offered every paid plan');
      await page.getByRole('radio', { name: 'Pro, 2000 Vibes a month', checked: true }).waitFor();
      // The allowance is the headline and comes from the wallet's own products, never
      // written as copy. It used to be a multiple of the free grant, which stopped
      // meaning anything once the trial shrank to a taste. A four-figure allowance
      // still has to stay on one line or the price under it drops off the baseline
      // the other two cards share.
      for (const [allowance, plan] of [['350', 'Starter'], ['1,000', 'Builder'], ['2,000', 'Pro']]) {
        const figure = page.getByText(allowance, { exact: true }); await figure.waitFor();
        assert.ok((await figure.boundingBox()).height < 40, `${allowance} must stay on one line`);
        await page.getByText(plan, { exact: true }).first().waitFor();
      }
      await page.getByText('£99.00', { exact: true }).waitFor();
      // Every bullet is a backend entitlement, not fixed marketing copy.
      for (const line of ['2,000 Vibes every month', 'Every model on OpenRouter', 'Unlimited projects',
        '3 replies at once']) await page.getByText(line, { exact: true }).waitFor();
      // Remote access is sold but not switched on, so it must not read as ready.
      await page.getByText('Remote access to your computer — coming soon', { exact: true }).waitFor();
      await capture(page, `${out}/${label}-${theme}-upgrade.png`);
      const buy = page.getByRole('button', { name: 'Upgrade to Pro · £99.00', exact: true });
      const bounds = await buy.boundingBox();
      assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
      // Choosing a plan replaces the price and the benefits; it never mixes two.
      await page.getByRole('radio', { name: 'Starter, 350 Vibes a month' }).click();
      await page.getByRole('button', { name: 'Upgrade to Starter · £20.00', exact: true }).waitFor();
      await page.getByText('350 Vibes every month', { exact: true }).waitFor();
      for (const gone of ['Unlimited projects', '3 replies at once', 'Every model on OpenRouter'])
        assert.equal(await page.getByText(gone, { exact: true }).count(), 0, `Starter must not advertise ${gone}`);
      await capture(page, `${out}/${label}-${theme}-starter.png`);

      // The back arrow returns to the balance rather than out of the area.
      await page.getByRole('button', { name: 'Back to your Vibes' }).click();
      await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
      assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), [],
        'going back is not closing the area');

      await page.getByRole('button', { name: 'Upgrade your plan' }).click();
      await page.getByRole('radio', { name: 'Pro, 2000 Vibes a month' }).click();
      await buy.click();
      // A finished purchase hands the page back, so the Vibes are seen arriving.
      await page.getByRole('heading', { name: '2,003 Vibes available', exact: true }).waitFor();
      await page.getByText('Your Vibes are ready. Return to your chat whenever you like.').waitFor();
      // Apple is asked first and the receipt is only finished once the server agrees.
      assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c !== 'wallet'), ['buy', 'verify', 'finish']);
      // The top plan has nothing left to sell, so the way to the plans goes away.
      assert.equal(await page.getByRole('button', { name: 'Upgrade your plan' }).count(), 0,
        'there is nothing more to get each month');
      // What a plan includes is sold on the page that sells the plan. Landing back
      // here after buying one must not turn the balance into that page again.
      for (const sold of ['2,000 Vibes every month', 'Every model on OpenRouter', 'Unlimited projects',
        '3 replies at once', 'Remote access to your computer — coming soon'])
        assert.equal(await page.getByText(sold, { exact: true }).count(), 0, `${sold} belongs on the upgrade page`);
      assert.equal(await page.getByRole('progressbar').count(), 2, 'the rate stays, because it is about today');
      // Adding Vibes outlives every plan, so it is what is left, and it is filled.
      const add = page.getByRole('button', { name: 'Add 500 Vibes · £20.00', exact: true }); await add.waitFor();
      await fullyVisible(add, page, 'adding Vibes');
      // Buying Pro widens both windows, and the meters are where that is felt: the
      // page says what the money bought without naming the plan back at the reader.
      await page.getByText('400 of 400', { exact: true }).waitFor();
      await page.getByText('1,000 of 1,000', { exact: true }).waitFor();
      await capture(page, `${out}/${label}-${theme}-top-plan.png`);
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${label}/${theme}: the balance leads, the plans are a page away, purchase hands back.`);
    }
  }
  // The reported bug: tapping the balance went nowhere at all. It has to land on
  // the balance, and the balance has to hand itself back.
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?entry=1&theme=${theme}`);
    const row = page.getByRole('button', { name: '3 Vibes, Free plan' });
    await row.waitFor();
    const box = await row.boundingBox();
    assert.ok(box && box.height >= 44, 'the balance is a real tap target');
    await row.click();
    await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
    await capture(page, `${out}/${theme}-from-balance.png`);
    // The X closes the area from either page, and it is the way back out.
    await page.getByRole('button', { name: 'Upgrade your plan' }).click();
    await page.getByRole('heading', { name: 'Get more each month', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await row.waitFor();
    assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), ['close']);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS entry/${theme}: the balance opens the page and the X hands the area back.`);
  }
  await checkHeld(open, capture, out);
  await checkNoStore(open, capture, out);
  await checkMotion(browser, `http://127.0.0.1:${server.address().port}/`, capture, out);
  await checkCancelled(open);
  const at = search => `http://127.0.0.1:${server.address().port}/?${search}`;
  await checkSignedOut(browser, at, capture, out);
  await checkSpent(open, capture, out);
  await checkPartial(open, capture, out);
  console.log(`Screenshots: ${out}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
