import assert from 'node:assert/strict';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

/** Page two of Vibyra tokens, the upgrade page, and the purchase it ends in:
 *  run on a page that is showing the balance. */
export async function checkUpgrade(page, { label, theme, width, height, out }) {
      // Page two sells Pro, one button away: the mark, the headline, one line, what it
      // gives you, then the purchase. It was asked to be that simple and to stay so.
      await page.getByRole('button', { name: 'Upgrade your plan' }).click();
      await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
      await page.getByText('All your Pro features. More Vibes to use them.', { exact: true }).waitFor();
      await fullyVisible(page.getByTestId('pro-art'), page, 'the Pro mark');
      // Two sizes of one plan, chosen by a tab (`checkSizes`), never priced cards.
      assert.equal(await page.getByRole('radio').count(), 0, 'the page sells one plan, in sizes');
      for (const gone of ['Upgrade', 'Get more each month', 'Starter', 'Builder', 'Manage'])
        assert.equal(await page.getByText(gone, { exact: true }).count(), 0, `${gone} is more than the page needs`);
      assert.equal(await page.getByText(/You are on the|Cancel any time|How far Vibes go/).count(), 0,
        'no text beyond what was asked for');
      // Every bullet is a backend entitlement, not fixed marketing copy.
      await page.getByRole('heading', { name: 'What Pro gives you', exact: true }).waitFor();
      for (const line of ['2,000 Vibes every month', 'Choose from more AI models', 'Unlimited projects',
        'All Pro features included']) await page.getByText(line, { exact: true }).waitFor();
      // Sell only live capabilities, and explain the value of unused paid credits.
      assert.equal(await page.getByText('Build on your computer remotely', { exact: true }).count(), 0);
      await page.getByText('Unused paid Vibes roll over', { exact: true }).waitFor();
      assert.equal(await page.getByText(/coming soon/i).count(), 0, 'no benefit is qualified on the page');
      // The purchase is pinned to the very bottom with the renewal line under it, in
      // view without scrolling on both phones, and nothing it sells hides behind it.
      const buy = page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month', exact: true });
      const renews = page.getByText('Billed through your Apple Account. Renews monthly until cancelled.', { exact: true });
      const bounds = await buy.boundingBox();
      assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
      for (const [what, at] of [['the purchase', buy], ['the renewal line', renews],
        ...['Restore Purchases', 'Terms', 'Privacy'].map(name => [name, page.getByRole('button', { name, exact: true })])])
        await fullyVisible(at, page, what);
      assert.ok((await renews.boundingBox()).y >= bounds.y + bounds.height, 'the renewal line sits under the button');
      const small = await page.getByRole('button', { name: 'Privacy', exact: true }).boundingBox();
      assert.ok(height - (small.y + small.height) <= 120, 'the purchase is at the bottom of the screen');
      const line = await page.getByTestId('bullet').last().boundingBox();
      await capture(page, `${out}/${label}-${theme}-upgrade.png`);
      assert.ok(line.y + line.height <= bounds.y, `every line sits above the purchase: ${line.y + line.height} <= ${bounds.y}`);
      await capture(page, `${out}/${label}-${theme}-upgrade.png`);

      // The back arrow returns to the balance rather than out of the area.
      await page.getByRole('button', { name: 'Back to your Vibes' }).click();
      await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
      assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), [],
        'going back is not closing the area');

      await page.getByRole('button', { name: 'Upgrade your plan' }).click();
      const preview = page.getByRole('button', { name: 'Test Pro upgrade', exact: true });
      if (await preview.count()) {
        const beforePreview = await page.evaluate(() => window.walletCalls.filter(c => c !== 'wallet'));
        await preview.click();
        await page.getByRole('heading', { name: 'Preview: you’re Pro!' }).waitFor();
        assert.equal(await page.getByTestId('upgrade-confetti').count(), 0, 'Reduce Motion removes falling confetti');
        await page.getByTestId('upgrade-added').filter({ hasText: '+2,000 Vibes' }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.walletCalls.filter(c => c !== 'wallet')), beforePreview);
        await capture(page, `${out}/${label}-${theme}-celebration-preview.png`);
        await page.getByRole('button', { name: 'Finish preview' }).click();
        await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
      }
      await buy.click();
      await page.getByRole('heading', { name: 'You’re Pro!', exact: true }).waitFor();
      await page.getByTestId('upgrade-added').filter({ hasText: '+2,000 Vibes' }).waitFor();
      await capture(page, `${out}/${label}-${theme}-celebration.png`);
      await page.getByRole('button', { name: 'Let’s build' }).click();
      // A finished purchase hands the page back, so the Vibes are seen arriving.
      await page.getByRole('heading', { name: '2,003 Vibes available', exact: true }).waitFor();
      await page.getByText('Your Pro features and Vibes are ready.').waitFor();
      // Apple is asked first and the receipt is only finished once the server agrees.
      assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c !== 'wallet'), ['buy', 'verify', 'finish']);
      // The top plan has nothing left to sell, so the way to the plans goes away.
      assert.equal(await page.getByRole('button', { name: 'Upgrade your plan' }).count(), 0,
        'there is nothing more to get each month');
      // What a plan includes is sold on the page that sells the plan. Landing back
      // here after buying one must not turn the balance into that page again.
      for (const sold of ['2,000 Vibes every month', 'Choose from more AI models', 'Unlimited projects',
        'All Pro features included', 'Remote access to your computer'])
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
}

/** The rail's balance pill: the way into Vibyra tokens, and the X that hands the area back. */
export async function checkEntry(browser, at, out) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(at(`entry=1&theme=${theme}`));
    const row = page.getByRole('button', { name: '3 Vibes', exact: true });
    await row.waitFor();
    assert.equal(await row.innerText(), '3', 'the pill says the number and lets the coin be its unit');
    const box = await row.boundingBox();
    assert.ok(box && box.height >= 44, 'the balance is a real tap target');
    await capture(page, `${out}/${theme}-rail-pill.png`);
    await row.click();
    await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
    await capture(page, `${out}/${theme}-from-balance.png`);
    // The X closes the area from either page, and it is the way back out.
    await page.getByRole('button', { name: 'Upgrade your plan' }).click();
    await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await row.waitFor();
    assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), ['close']);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS entry/${theme}: the balance opens the page and the X hands the area back.`);
  }
}
