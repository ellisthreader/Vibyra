import assert from 'node:assert/strict';
import { fullyVisible } from './ui-test-helpers.mjs';

/** Switching sizes updates only the offer facts, with no rolling/loading state. */
export async function checkSizes(browser, url, capture, out) {
  for (const [width, height] of [[375, 667], [430, 932]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: 'Upgrade your plan' }).click();
    const tabs = page.getByRole('tablist');
    await fullyVisible(tabs, page, 'the size switch');
    assert.equal(await page.getByRole('tab').count(), 2);
    await page.getByRole('tab', { name: /^Pro 20×/, selected: true }).waitFor();
    const ten = page.getByRole('tab', { name: /^Pro 10×/ });
    assert.ok((await ten.boundingBox()).height >= 40);
    const details = page.getByTestId('upgrade-details');
    const before = await details.allTextContents();
    assert.deepEqual(before, ['400 Vibes per 5 hoursUnlimited projectsUnused paid Vibes roll over']);

    await ten.click();
    await page.getByRole('tab', { name: /^Pro 10×/, selected: true }).waitFor();
    await page.getByTestId('plan-allowance').getByText('1,000', { exact: true }).waitFor();
    await details.getByText('200 Vibes per 5 hours', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Get Pro 10× · £49.00 a month', exact: true }).waitFor();
    assert.equal(await page.getByText(/Loading|Purchases unavailable/).count(), 0);
    await fullyVisible(page.getByTestId('upgrade-card'), page, 'the selected offer');
    await capture(page, `${out}/${width}-sizes-10x.png`);

    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await page.getByTestId('plan-allowance').getByText('2,000', { exact: true }).waitFor();
    assert.deepEqual(await details.allTextContents(), before, 'switching back restores the same benefits');
    await ten.click();
    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await ten.click();
    await page.getByTestId('plan-allowance').getByText('1,000', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Get Pro 10× · £49.00 a month', exact: true }).waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('tab', { name: /^Pro 20×/ }).click();
    await page.getByTestId('plan-allowance').getByText('2,000', { exact: true }).waitFor();
    assert.deepEqual(await details.allTextContents(), before);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS sizes: both Pro choices update allowance, rate and Apple price without loading UI.');
}
