import assert from 'node:assert/strict';

export async function verifyNotificationStates({ open, shot, truncated }) {
  // ── every preference the page owns is actually written ────────────────
  {
    const { page, errors } = await open('');
    const last = () => page.evaluate(() =>
      window.notifEvents.filter(e => e[0] === 'update').at(-1)?.[1].notifications);

    // A write carries the whole blob: dropping a key here silently resets it.
    await page.getByRole('switch', { name: 'Desktop notifications' }).click();
    const away = await last();
    assert.equal(away.osEnabled, false, 'the desktop switch is written');
    // `osOnlyWhenAway` has no control any more but must survive every write.
    assert.equal(away.osOnlyWhenAway, true, 'a preference with no UI is still carried through');
    assert.deepEqual(Object.keys(away).sort(),
      ['agentIdleEnabled', 'categories', 'enabled', 'osEnabled', 'osOnlyWhenAway', 'soundEnabled', 'volume'],
      'a write carries every preference, not just the one that changed');
    assert.equal(Object.keys(away.categories).length, 9, 'and every category');

    // Where an event shows, both ways, and that turning it off and on again
    // does not quietly re-open it to the desktop.
    const os = page.getByRole('button', { name: 'Also show Agent finished on the desktop' });
    assert.equal(await os.getAttribute('aria-pressed'), 'true');
    await os.click();
    assert.equal((await last()).categories.agentDone.channel, 'app', 'the desktop toggle writes the channel');
    const done = page.getByRole('switch', { name: 'Agent finished' });
    await done.click();
    assert.equal((await last()).categories.agentDone.channel, 'off', 'the switch turns the event off');
    await done.click();
    assert.equal((await last()).categories.agentDone.channel, 'app',
      'and back on where the user left it, not back on the desktop');

    // App problems cannot be silenced on its own; the master switch does that.
    await page.getByRole('button', { name: 'More events' }).click();
    await page.getByText('App problems').waitFor();
    assert.ok(await page.getByRole('switch', { name: 'App problems' }).isDisabled(),
      'an app that fails quietly just looks broken');
    assert.equal(await page.getByRole('button', { name: /App problems on the desktop/ }).count(), 0,
      'and it cannot reach the desktop at all');

    await page.getByRole('switch', { name: 'Tell me when an agent goes quiet' }).click();
    assert.equal((await last()).agentIdleEnabled, true, 'the idle toggle is written');
    assert.deepEqual(errors, [], 'writes page errors');
    await page.close();
  }

  // ── a drag is one write, on release ───────────────────────────────────
  {
    const { page, errors } = await open('volume=0.2');
    const track = page.locator('.volslider__track');
    const box = await track.boundingBox();
    await page.mouse.move(box.x + 6, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(box.x + 6 + ((box.width - 12) * i) / 10, box.y + box.height / 2);
    }
    assert.equal(await page.evaluate(() => window.notifEvents.filter(e => e[0] === 'update').length), 0,
      'a drag writes nothing: every write is an atomic settings.json write');
    assert.equal(await track.getAttribute('aria-valuetext'), 'Loudest', 'but the value tracks the pointer');
    await page.mouse.up();
    const writes = await page.evaluate(() =>
      window.notifEvents.filter(e => e[0] === 'update').map(e => e[1].notifications.volume));
    assert.deepEqual(writes, [1], `releasing writes once, got ${JSON.stringify(writes)}`);
    assert.deepEqual(errors, [], 'drag page errors');
    await page.close();
  }

  // ── states: silent, master off, permission refused ────────────────────
  {
    const { page, errors } = await open('silent');
    assert.equal(await page.locator('.cuepick').count(), 0, 'sounds off removes the cue column, not just its contents');
    const x = await page.evaluate(() =>
      [...document.querySelectorAll('.notif-event .vswitch')].map(el => Math.round(el.getBoundingClientRect().right)));
    assert.equal(new Set(x).size, 1, `switches still line up with no sound column: ${x}`);
    assert.deepEqual(errors, [], 'silent: page errors');
    await shot(page, 'dark-silent');
    await page.close();
  }
  {
    const { page, errors } = await open('off');
    assert.equal(await page.locator('.settings-pane__body .vswitch:not([disabled])').count(), 1,
      'with notifications off, the only live control is the way back on');
    assert.equal(await page.getByRole('slider', { name: 'Notification volume' }).count(), 0,
      'and the volume of nothing is not offered');
    assert.deepEqual(errors, [], 'off: page errors');
    await shot(page, 'dark-off');
    await page.close();
  }
  {
    const { page, errors } = await open('permission=denied');
    await page.getByText('Blocked').waitFor();
    assert.equal(await page.getByRole('switch', { name: 'Desktop notifications' }).count(), 0,
      'a refused grant offers no switch to contradict the chip');
    assert.deepEqual(errors, [], 'blocked: page errors');
    await shot(page, 'dark-blocked');
    await page.close();
  }
  {
    const { page, errors } = await open('permission=unknown');
    await page.getByRole('button', { name: 'Allow' }).waitFor();
    assert.deepEqual(errors, [], 'unasked: page errors');
    await shot(page, 'dark-unasked');
    await page.close();
  }

  // ── a real window can be short; nothing may be clipped with no way to it ──
  {
    const { page, errors } = await open('', { width: 1000, height: 620 });
    await page.getByRole('button', { name: 'More events' }).click();
    await page.getByText('App problems').waitFor();
    const reachable = await page.evaluate(() => {
      const body = document.querySelector('.settings-pane__body');
      body.scrollTop = body.scrollHeight;
      const last = [...document.querySelectorAll('.notif-event')]
        .find(el => el.textContent.startsWith('Agent goes quiet'));
      const r = last.getBoundingClientRect(), b = body.getBoundingClientRect();
      return r.bottom <= b.bottom + 1 && r.top >= b.top - 1;
    });
    assert.ok(reachable, 'the last row can be scrolled fully into view in a short window');
    assert.deepEqual(await truncated(page), [], 'narrow: nothing clips at 1000px');
    assert.deepEqual(errors, [], 'short window: page errors');
    await shot(page, 'dark-short');
    await page.close();
  }
}
