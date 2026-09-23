import assert from 'node:assert/strict';

export async function verifyPerformanceDetail({ page, check, pick, output, errors }) {
  // 4. The "?" beside the label summarises the level that is selected, and
  //    only the lines that level actually switches on.
  const hint = () => page.getByRole('button', { name: /^What .+ does$/ });
  const tip = () => page.getByRole('tooltip');
  const AWAY = [640, 120];
  const openHint = async () => { await hint().hover(); await tip().waitFor(); };
  // Moving the pointer off the dot is also how the panel is dismissed, so the
  // teardown between levels exercises the close path on every pass.
  const closeHint = async () => { await page.mouse.move(...AWAY); await tip().waitFor({ state: 'detached' }); };

  await pick('best');
  await openHint();
  await check('the hint names the selected level', async () => {
    // Wait on the title itself, not just the panel: the panel re-renders once
    // after it measures, and a one-shot read can land on the pass between.
    const title = tip().locator('.setting-hint__title');
    await title.waitFor();
    assert.match(await title.innerText(), /^Best performance/);
  });
  await check('Best performance summarises all six changes', async () => {
    assert.equal(await tip().locator('.setting-hint__list li').count(), 6);
  });
  await check('the panel is not clipped by the settings card', async () => {
    const box = await tip().boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0, `panel starts off screen at ${box.x},${box.y}`);
    assert.ok(box.x + box.width <= 1280 && box.y + box.height <= 900, 'panel runs off the window');
  });
  await check('the panel sits above the settings modal', async () => {
    // `.settings-group` clips and the modal stacks at 80, so a panel that was
    // merely positioned would be hidden rather than legible.
    const onTop = await page.evaluate(() => {
      const box = document.querySelector('.setting-hint').getBoundingClientRect();
      const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return Boolean(at?.closest('.setting-hint'));
    });
    assert.equal(onTop, true);
  });
  await page.screenshot({ path: `${output}/dark-best-hint.png` });
  await closeHint();

  await pick('balanced');
  await openHint();
  await check('Balanced summarises only its two changes', async () => {
    assert.equal(await tip().locator('.setting-hint__list li').count(), 2);
  });
  await page.screenshot({ path: `${output}/dark-balanced-hint.png` });
  await closeHint();

  await pick('full');
  await openHint();
  await check('Full says plainly that nothing is held back', async () => {
    assert.equal(await tip().locator('.setting-hint__list li').count(), 0);
    assert.match(await tip().innerText(), /Nothing is held back/);
  });
  await page.screenshot({ path: `${output}/dark-full-hint.png` });

  await check('a hover-opened hint does not claim Escape', async () => {
    // Escape with the pointer merely resting near a "?" must still close the
    // Settings dialog, so the panel only marks itself owner when focused.
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-escape-owner]').length), 0);
  });
  await closeHint();
  await check('a keyboard-opened hint claims Escape and closes on it', async () => {
    await hint().focus();
    await tip().waitFor();
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-escape-owner]').length), 1);
    await page.keyboard.press('Escape');
    await tip().waitFor({ state: 'detached' });
    // ...and the dialog under it is still open, which is the whole point.
    await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  });
  await check('moving away closes the hint', async () => {
    await openHint();
    await closeHint();
  });
  await check('no page errors while switching', () => assert.deepEqual(errors, []));

  // 5. The row has to fit its own width: three levels, a chip and the "?" is
  //    the most this control has ever had to carry.
  await check('nothing overflows the settings column', async () => {
    const overflow = await page.evaluate(() => {
      const row = document.querySelector('.setting-label').closest('.setting-row');
      const group = row.querySelector('.segmented');
      return { row: row.scrollWidth - row.clientWidth, group: group.scrollWidth - group.clientWidth };
    });
    assert.deepEqual(overflow, { row: 0, group: 0 });
  });
  await page.close();
}
