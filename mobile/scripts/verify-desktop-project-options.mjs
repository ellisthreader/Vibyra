import assert from 'node:assert/strict';

export async function verifyProjectOptions({ page, server, theme, out }) {
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&models`);
    assert.equal(await page.locator('.launch-effort__stops i').count(), 6);
    await page.getByRole('button', { name: /More models/ }).click();
    const list = page.getByRole('listbox', { name: 'All models' });
    await list.hover(); await page.mouse.wheel(0, 1600);
    await page.waitForFunction(() => document.querySelector('.launch-model-browser__list').scrollTop > 100);
    assert(await list.evaluate(el => el.scrollHeight > el.clientHeight));
    await page.getByRole('option', { name: 'Model 36', exact: true }).click();
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.getByRole('textbox', { name: 'Search models' }).fill('Model 20');
    assert.equal(await page.getByRole('option').count(), 1);
    await page.getByRole('textbox', { name: 'Search models' }).press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.screenshot({ path: `${out}/models-${theme}.png` });
    await page.keyboard.press('Escape'); assert.equal(await list.count(), 0);
    for (const provider of ['codex', 'claude']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&${provider}`);
      const effort = page.getByRole('slider', { name: 'Effort' });
      await effort.focus(); await effort.press('End');
      const row = page.locator('.launch-effort');
      assert.equal(await row.getAttribute('data-effort'), provider === 'claude' ? 'ultracode' : 'ultra');
      const animation = row.locator('.launch-effort-animation');
      await page.waitForFunction(() => Boolean(document.querySelector('.launch-effort-animation')?.dataset.effect));
      assert.match(await animation.getAttribute('data-effect'), provider === 'claude' ? /^violet-ripple$/ : /^(wave|aurora|pulse)$/);
      await effort.blur(); await page.screenshot({ path: `${out}/effort-${provider}-${theme}.png` });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('.launch-effort')?.dataset.motion === 'still');
      assert.equal(await row.getAttribute('data-motion'), 'still');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await effort.focus(); await effort.press('Home');
      await page.waitForFunction(() => !document.querySelector('.launch-effort-animation')?.dataset.effect);
      assert.equal(await animation.getAttribute('data-effect'), null);
    }
}
