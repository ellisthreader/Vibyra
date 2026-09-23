import assert from 'node:assert/strict';

export async function verifyNotificationControls({ open, shot, truncated, holes }) {
  // ── the volume control commits, and only when it settles ──────────────
  {
    const { page, errors } = await open('volume=0.4');
    const slider = page.getByRole('slider', { name: 'Notification volume' });
    assert.equal(await slider.getAttribute('aria-valuenow'), '2');
    await page.evaluate(() => { window.notifEvents.length = 0; });
    await slider.focus();
    await slider.press('ArrowRight');
    assert.equal(await slider.getAttribute('aria-valuenow'), '3', 'one key is one step');
    await slider.press('End');
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Loudest');
    const writes = await page.evaluate(() =>
      window.notifEvents.filter(e => e[0] === 'update').map(e => e[1].notifications.volume));
    assert.deepEqual(writes, [0.6, 1], `one write per settled step, got ${JSON.stringify(writes)}`);
    // Mounting must not rewrite a value that only needed snapping to display.
    const { page: p2 } = await open('volume=0.5');
    assert.equal(await p2.evaluate(() => window.notifEvents.filter(e => e[0] === 'update').length), 0,
      'an unsnapped saved volume is displayed, not silently rewritten');
    // …but committing the step it displays as must reconcile the file with the
    // word on screen, or 0.5 stays on disk while everything says Medium.
    const mid = p2.getByRole('slider', { name: 'Notification volume' });
    await mid.focus();
    await mid.press('ArrowRight');
    await mid.press('ArrowLeft');
    assert.equal(await p2.evaluate(() =>
      window.notifEvents.filter(e => e[0] === 'update').at(-1)?.[1].notifications.volume), 0.6,
      'stepping back to the displayed value writes it rather than leaving 0.5 behind');
    assert.deepEqual(errors, [], 'volume page errors');
    await page.close();
    await p2.close();
  }

  // ── the cue menu opens in the viewport and commits what you pick ──────
  {
    const { page, errors } = await open('');
    const trigger = page.getByRole('combobox', { name: 'Agent needs you sound' });
    await trigger.click();
    const menu = page.getByRole('listbox');
    await menu.waitFor();
    const box = await menu.boundingBox();
    const view = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height,
      `menu stays inside the window: ${JSON.stringify(box)}`);
    // It must hang off the trigger, above or below. Sizing the menu to its cap
    // rather than its content once left an 85px hole between the two.
    const anchor = await trigger.boundingBox();
    const gap = box.y > anchor.y ? box.y - (anchor.y + anchor.height) : anchor.y - (box.y + box.height);
    assert.ok(gap >= 0 && gap <= 12, `menu hugs its trigger, gap was ${Math.round(gap)}px`);
    // A menu wider than its trigger aligns by the far edge, so it grows back
    // into the empty space on its left rather than overhanging its column.
    assert.ok(Math.abs((box.x + box.width) - (anchor.x + anchor.width)) <= 1,
      `menu aligns with the column it belongs to: menu ${Math.round(box.x + box.width)} vs trigger ${Math.round(anchor.x + anchor.width)}`);
    const modal = await page.locator('.settings-modal').boundingBox();
    assert.ok(box.y >= modal.y && box.y + box.height <= modal.y + modal.height + 1,
      'the menu stays inside the dialog rather than hanging onto the scrim');
    assert.deepEqual(await truncated(page), [], 'no option label clips inside the menu');
    assert.deepEqual(await holes(page), [], 'the menu is not filled with the page background');
    await shot(page, 'dark-cue-menu');
    // The menu carries theme-specific rules of its own and renders outside the
    // pane, so it needs looking at on the pale ground too.
    const { page: lit } = await open('light');
    await lit.getByRole('combobox', { name: /Agent needs you sound/ }).click();
    await lit.getByRole('listbox').waitFor();
    assert.deepEqual(await holes(lit), [], 'light: the menu is not filled with the page background');
    await shot(lit, 'light-cue-menu');
    await lit.close();
    await page.evaluate(() => { window.notifEvents.length = 0; });
    await page.getByRole('option', { name: 'Chime' }).click();
    await menu.waitFor({ state: 'detached' });
    const cue = await page.evaluate(() =>
      window.notifEvents.filter(e => e[0] === 'update').at(-1)?.[1].notifications.categories.agentAttention.cue);
    assert.equal(cue, 'chime', 'picking a sound saves it');
    // By ACCESSIBLE NAME, not DOM text: an `aria-label` replaces the text, so
    // reading innerText here passed while the name said nothing about the cue.
    await page.getByRole('combobox', { name: /Agent needs you sound: Chime/ }).waitFor();

    // Re-picking the cue already set is how you hear it twice. It must play and
    // write nothing — every write here is an atomic settings.json write.
    await page.evaluate(() => { window.notifEvents.length = 0; });
    await trigger.click();
    await page.getByRole('option', { name: 'Chime' }).click();
    await menu.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.notifEvents.filter(e => e[0] === 'update').length), 0,
      're-picking the current cue previews it without writing');

    // The Escape contract, both halves: the menu takes the first Escape and the
    // dialog survives it; with no menu open the dialog takes the next one.
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await trigger.press('Enter');
    await menu.waitFor();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    assert.ok(await dialog.isVisible(), 'Escape closed the menu, not the Settings dialog under it');
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'focus returns to the trigger');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    // Tab out of an open menu returns focus to the trigger and carries on from
    // there; the dialog's focus trap sees a portal as "outside" and would
    // otherwise fling focus to the first control on the page.
    const { page: p3, errors: e3 } = await open('');
    const t3 = p3.getByRole('combobox', { name: /Agent needs you sound/ });
    await t3.press('Enter');
    await p3.getByRole('listbox').waitFor();
    await p3.keyboard.press('Tab');
    await p3.getByRole('listbox').waitFor({ state: 'detached' });
    const landed = await p3.evaluate(() => document.activeElement?.className ?? '');
    assert.ok(!landed.includes('settings-find__input'),
      `Tab left the menu for the top of the dialog: ${landed}`);
    assert.deepEqual(errors, [], 'cue page errors');
    assert.deepEqual(e3, [], 'tab page errors');
    await page.close();
    await p3.close();
  }

}
