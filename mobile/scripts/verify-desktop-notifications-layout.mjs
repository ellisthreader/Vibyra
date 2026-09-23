import assert from 'node:assert/strict';

export async function verifyNotificationLayout({ open, shot, truncated, holes }) {
  for (const theme of ['dark', 'light']) {
    const t = theme === 'light' ? 'light' : '';

    // ── the page as it arrives ───────────────────────────────────────────
    const { page, errors } = await open(t);
    await page.getByText('Show notifications').first().waitFor();

    // Two groups, one heading. The pane header already says Notifications, and
    // a "SOUND" heading over a row called "Play sounds" says it twice more.
    // `allInnerTexts` reports the rendered casing, which the shell uppercases.
    const labels = await page.locator('.settings-pane__body .section-label').allInnerTexts();
    assert.deepEqual(labels.map(s => s.trim().toLowerCase()), ['events'],
      `only the event list is headed: got ${JSON.stringify(labels)}`);
    assert.equal(await page.locator('.settings-pane__body .settings-group').count(), 2,
      'the page is two groups, not five');
    // Where they show first, then the sound, with volume indented under it.
    const order = await page.evaluate(() => [...document.querySelectorAll(
      '.settings-pane__body .settings-group:first-of-type .setting-row__label')].map(el => el.textContent));
    assert.deepEqual(order, ['Show notifications', 'Desktop notifications', 'Play sounds', 'Volume'],
      `top group order: ${JSON.stringify(order)}`);

    // The volume control states its value; the bars it replaced said nothing.
    const slider = page.getByRole('slider', { name: 'Notification volume' });
    await slider.waitFor();
    // The shipped default is 0.5, which sits on a tie between two steps and
    // must not present itself as "Quiet".
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Medium', 'the 0.5 default reads as Medium');
    await assert.doesNotReject(page.getByText('Medium', { exact: true }).waitFor(),
      'the value is written beside the slider, not only in aria');

    assert.deepEqual(await truncated(page), [], `${theme}: nothing may clip its own label`);
    assert.deepEqual(await holes(page), [], `${theme}: no control is filled with the page background`);
    await shot(page, `${theme}-page`);

    // ── the event list holds one column ─────────────────────────────────
    const columns = await page.evaluate(() => {
      const x = (sel) => [...document.querySelectorAll(sel)].map(el => Math.round(el.getBoundingClientRect().right));
      return { switches: x('.notif-event .vswitch'), cues: x('.notif-event .cuepick') };
    });
    assert.equal(columns.switches.length, 4, 'four frequent events are on the page');
    assert.equal(new Set(columns.switches).size, 1, `switches share one column: ${columns.switches}`);
    assert.equal(new Set(columns.cues).size, 1, `cue pickers share one column: ${columns.cues}`);

    // Rows that cannot reach the desktop still hold the column open.
    await page.getByRole('button', { name: 'More events' }).click();
    await page.getByText('App problems').waitFor();
    const all = await page.evaluate(() =>
      [...document.querySelectorAll('.notif-event .vswitch')].map(el => Math.round(el.getBoundingClientRect().right)));
    // Nine categories plus "Agent goes quiet", which is a plain boolean but
    // still an event, and so shares the list rather than a group of its own.
    assert.equal(all.length, 10, 'every event is reachable');
    assert.equal(new Set(all).size, 1, `every switch lines up, desktop-capable or not: ${all}`);
    const indents = await page.evaluate(() =>
      [...document.querySelectorAll('.notif-event__label')].map(el => Math.round(el.getBoundingClientRect().left)));
    assert.equal(new Set(indents).size, 1, `every event label starts at one indent: ${[...new Set(indents)]}`);
    assert.deepEqual(await truncated(page), [], `${theme}: nothing clips with every event open`);
    await shot(page, `${theme}-events`);

    // Nothing may spill sideways out of the pane at any point.
    const spill = await page.evaluate(() => {
      const body = document.querySelector('.settings-pane__body');
      return body.scrollWidth - body.clientWidth;
    });
    assert.ok(spill <= 1, `${theme}: pane scrolls sideways by ${spill}px`);
    assert.deepEqual(errors, [], `${theme}: page errors`);
    await page.close();
  }
}
