import assert from 'node:assert/strict';
import { fullyVisible } from './ui-test-helpers.mjs';
import { sample } from './verify-wallet-states.mjs';

/**
 * The size switch. Pro 10× and Pro 20× differ only in Vibes, so the tab changes the
 * figures and the price and nothing else: the figures roll to their new value and
 * every other line stays exactly where it was. Run with motion on, so the roll is
 * caught mid-flight, and on both phones, because the smaller has no height to spare.
 */
export async function checkSizes(browser, url, capture, out) {
  for (const [width, height] of [[375, 667], [430, 932]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: 'Upgrade your plan' }).click();
    const tabs = page.getByRole('tablist'); await tabs.waitFor();
    await fullyVisible(tabs, page, 'the size tab');
    assert.equal(await page.getByRole('tab').count(), 2, 'a free account chooses between two sizes of Pro');
    await page.getByRole('tab', { name: /^Pro 20×/, selected: true }).waitFor();
    const ten = page.getByRole('tab', { name: /^Pro 10×/ });
    assert.ok((await ten.boundingBox()).height >= 36, 'each size is a real tap target');
    await page.waitForTimeout(800); // the list's own arrival, so it is not mistaken for the switch
    const rows = page.getByTestId('bullet');
    const before = await rows.allTextContents();
    await ten.click();
    // Every frame of the switch: each row's words and opacity. Nothing re-enters.
    const frames = await sample(page, '[data-testid="bullets"]', 900, node => [...node.querySelectorAll('[data-testid="bullet"]')]
      .map(row => ({ text: row.textContent, opacity: Number(getComputedStyle(row).opacity) })));
    await page.getByRole('tab', { name: /^Pro 10×/, selected: true }).waitFor();
    await page.getByText('1,000 Vibes every month', { exact: true }).waitFor();
    const after = await rows.allTextContents();
    assert.equal(after.length, before.length, 'the same rows, in the same order');
    const moved = before.map((line, i) => line !== after[i] ? i : -1).filter(i => i >= 0);
    assert.deepEqual(moved.map(i => after[i]), ['•1,000 Vibes every month', '•200 Vibes per 5 hours'],
      'only the figures of Vibes change between sizes');
    assert.ok(frames.every(rows => rows.every(row => row.opacity > 0.99)), 'no row fades out or back in');
    assert.ok(frames.some(rows => ![before[0], after[0]].includes(rows[0].text)), 'the old allowance transitions into the new one');
    assert.ok(frames.every(rows => rows[0].text.replace('•', '').replace(' Vibes every month', '')
      .replaceAll('2,000', '').replaceAll('1,000', '') === ''), 'no invented intermediate allowance is shown');
    // Still Pro, still the same page: the headline, the lead and the list's name stay.
    await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
    await page.getByText('All your Pro features. More Vibes to use them.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'What Pro gives you', exact: true }).waitFor();
    const buy = page.getByRole('button', { name: 'Get Pro 10× · £49.00 a month', exact: true });
    await fullyVisible(buy, page, 'the Pro 10× purchase');
    const line = await rows.last().boundingBox();
    assert.ok(line.y + line.height <= (await buy.boundingBox()).y, 'every Pro 10× line sits above the purchase');
    await capture(page, `${out}/${width}-sizes-10x.png`);
    // And back: the switch is a switch, not a one-way door.
    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month', exact: true }).waitFor();
    await page.getByText('2,000 Vibes every month', { exact: true }).waitFor();
    assert.deepEqual(await rows.allTextContents(), before, 'switching back restores every line');
    // Quick changes must settle on the last choice, without a delayed reel or price.
    await ten.click();
    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await ten.click();
    await page.getByText('1,000 Vibes every month', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Get Pro 10× · £49.00 a month', exact: true }).waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await page.getByText('2,000 Vibes every month', { exact: true }).waitFor();
    assert.deepEqual(await rows.allTextContents(), before, 'Reduce Motion settles directly on the selected allowances');
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS sizes: clear allowance transitions, rapid switching and Reduce Motion.');
}
