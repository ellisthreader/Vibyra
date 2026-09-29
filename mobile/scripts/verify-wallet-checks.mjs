import assert from 'node:assert/strict';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

/** The centered Pro offer and the verified purchase it leads to. */
export async function checkUpgrade(page, { label, theme, width, height, out }) {
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
  const card = page.getByTestId('upgrade-card');
  const box = await card.boundingBox();
  assert.ok(box && Math.abs(box.x + box.width / 2 - width / 2) < 2, 'the offer is horizontally centered');
  assert.ok(Math.abs(box.y + box.height / 2 - height / 2) < 120, 'the offer stays near the middle');
  assert.equal(await page.getByTestId('pro-art').count(), 0, 'the oversized art is gone');
  assert.equal(await page.getByText(/Loading|Purchases unavailable/).count(), 0, 'no loading placeholder');
  await page.getByText('More Vibes for everything you build.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: /^Pro 20×/, selected: true }).waitFor();
  await page.getByTestId('plan-allowance').getByText('2,000', { exact: true }).waitFor();
  const details = page.getByTestId('upgrade-details');
  for (const line of ['400 Vibes per 5 hours', 'Unlimited projects', 'Unused paid Vibes roll over'])
    await details.getByText(line, { exact: true }).waitFor();
  assert.equal(await details.getByText(/Choose from more AI models|Remote access/).count(), 0);
  const buy = page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month', exact: true });
  const renews = page.getByText('Billed through your Apple Account. Renews monthly until cancelled.', { exact: true });
  await fullyVisible(card, page, 'the offer card');
  await fullyVisible(buy, page, 'the purchase');
  await fullyVisible(renews, page, 'the renewal line');
  await fullyVisible(page.getByRole('button', { name: 'Restore Purchases', exact: true }), page, 'Restore Purchases');
  for (const name of ['Terms', 'Privacy', 'App licence'])
    await fullyVisible(page.getByRole('link', { name, exact: true }), page, name);
  const action = await buy.boundingBox();
  assert.ok(action && action.y >= box.y && action.y + action.height <= box.y + box.height,
    'the purchase lives inside the offer');
  await capture(page, `${out}/${label}-${theme}-upgrade.png`);

  await page.getByRole('button', { name: 'Back to your Vibes' }).click();
  await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), []);
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  const preview = page.getByRole('button', { name: 'Test Pro upgrade', exact: true });
  if (await preview.count()) {
    const before = await page.evaluate(() => window.walletCalls.filter(c => c !== 'wallet'));
    await preview.click();
    await page.getByRole('heading', { name: 'Preview: you’re Pro!' }).waitFor();
    assert.equal(await page.getByTestId('upgrade-confetti').count(), 0);
    await page.getByTestId('upgrade-added').filter({ hasText: '+2,000 Vibes' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.walletCalls.filter(c => c !== 'wallet')), before);
    await capture(page, `${out}/${label}-${theme}-celebration-preview.png`);
    await page.getByRole('button', { name: 'Finish preview' }).click();
    await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
  }
  await buy.click();
  await page.getByRole('heading', { name: 'You’re Pro!', exact: true }).waitFor();
  await page.getByTestId('upgrade-added').filter({ hasText: '+2,000 Vibes' }).waitFor();
  await capture(page, `${out}/${label}-${theme}-celebration.png`);
  await page.getByRole('button', { name: 'Let’s build' }).click();
  await page.getByRole('heading', { name: '2,003 Vibes available', exact: true }).waitFor();
  await page.getByText('Your Pro features and Vibes are ready.').waitFor();
  assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c !== 'wallet'), ['buy', 'verify', 'finish']);
  assert.equal(await page.getByRole('button', { name: 'Upgrade your plan' }).count(), 0);
  assert.equal(await page.getByRole('progressbar').count(), 2);
  const add = page.getByRole('button', { name: 'Add 500 Vibes · £20.00', exact: true });
  await fullyVisible(add, page, 'adding Vibes');
  await page.getByText('400 of 400', { exact: true }).waitFor();
  await page.getByText('1,000 of 1,000', { exact: true }).waitFor();
  await capture(page, `${out}/${label}-${theme}-top-plan.png`);
}

/** The rail balance pill opens the area; close hands it back. */
export async function checkEntry(browser, at, out) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(at(`entry=1&theme=${theme}`));
    const row = page.getByRole('button', { name: '3 Vibes', exact: true });
    await row.waitFor();
    assert.equal(await row.innerText(), '3');
    assert.ok((await row.boundingBox()).height >= 44);
    await capture(page, `${out}/${theme}-rail-pill.png`);
    await row.click();
    await page.getByRole('heading', { name: '3 Vibes available', exact: true }).waitFor();
    await capture(page, `${out}/${theme}-from-balance.png`);
    await page.getByRole('button', { name: 'Upgrade your plan' }).click();
    await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await row.waitFor();
    assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c === 'close'), ['close']);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS entry/${theme}: the balance opens the page and the X hands the area back.`);
  }
}
