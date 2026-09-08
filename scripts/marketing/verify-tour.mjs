import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function verifyTour(page, output, AxeBuilder) {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['small', 320, 740], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height });
    const trigger = page.getByRole('button', { name: 'Guided tour', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(await dialog.getByRole('button', { name: 'Close demo' }).evaluate(el => el === document.activeElement), true);
    await dialog.getByRole('tab', { name: /Build/ }).click();
    assert.equal(await dialog.locator('h2').innerText(), 'An idea becomes a project.');
    assert.ok((await dialog.locator('.terminal-content').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 11);
    await dialog.screenshot({ path: `${output}/${name}-tour-build.png` });
    await page.keyboard.press('ArrowRight');
    assert.equal(await dialog.locator('h2').innerText(), 'See it. Try it. Refine it.');
    const viewport = dialog.locator('.preview-viewport');
    const desktopWidth = (await viewport.boundingBox()).width;
    await dialog.getByRole('button', { name: 'Phone', exact: true }).click();
    assert.ok((await viewport.boundingBox()).width < desktopWidth);
    await dialog.screenshot({ path: `${output}/${name}-tour-preview.png` });
    await dialog.getByRole('tab', { name: /Review/ }).click();
    assert.equal(await dialog.locator('h2').innerText(), 'Make the final call.');
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await dialog.screenshot({ path: `${output}/${name}-tour-review.png` });
    const code = dialog.locator('.review-code pre');
    if (await code.evaluate(el => el.scrollWidth > el.clientWidth)) {
      await code.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.tour-dialog .review-code pre').scrollLeft > 0);
    }
    if (name === 'desktop' || name === 'mobile') {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      await writeFile(`${output}/${name}-tour-accessibility.json`, JSON.stringify(axe, null, 2));
      assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    }
    // Native dialog must keep keyboard focus inside and restore the opener on Escape.
    await dialog.getByRole('button', { name: 'Close demo' }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    // Closing removes the native dialog from the accessibility tree before
    // its close event unmounts React. Wait for physical DOM removal.
    await page.locator('.tour-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Guided tour', exact: true }).click();
  await page.mouse.click(2, 2);
  await page.locator('.tour-dialog').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('dialog').count(), 0, 'Backdrop dismisses the tour');
}
