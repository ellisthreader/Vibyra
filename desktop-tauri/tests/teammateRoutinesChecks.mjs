import assert from 'node:assert/strict';

/** Mac Agent v2 routines/triggers in the teammates fixture: schedule create → next-run preview → pause, trigger → webhook setup. */
export async function checkDesktopRoutines({ browser, url, out, kind }) {
  const off = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await off.goto(`${url}/?dark`); await openAccess(off);
  await off.getByText('Task budget', { exact: true }).waitFor(); await off.waitForTimeout(300);
  assert.equal(await off.getByRole('heading', { name: 'Routines', exact: true }).count(), 0, 'no routines without v2 capabilities');
  assert.equal(await off.getByRole('button', { name: 'New trigger', exact: true }).count(), 0);
  await off.close();
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const calls = () => page.evaluate(() => window.fixture.inspect().routines.calls);
    await page.goto(`${url}/?v2&${theme}`); await openAccess(page);
    await page.getByRole('heading', { name: 'Routines', exact: true }).waitFor();
    await button('New routine').click();
    await page.getByRole('textbox', { name: 'Routine instructions', exact: true }).fill('Review new issues and list the ones that need me.');
    await page.getByRole('radio', { name: 'Daily', exact: true }).click();
    await page.getByLabel('Time', { exact: true }).fill('07:30');
    await page.getByLabel('Timezone', { exact: true }).fill('Europe/London');
    await page.getByText(/^Next run: .*07:30$/).waitFor();
    await page.getByText('Every day at 07:30 · Europe/London', { exact: true }).waitFor();
    const preview = (await calls()).filter(c => c.path === 'agents/v2/schedules/preview').at(-1);
    assert.deepEqual(preview.body, { timezone: 'Europe/London', recurrence: { type: 'daily', time: '07:30' }, count: 3 });
    await page.locator('.routine-editor').first().screenshot({ path: `${out}/${kind}-${theme}-routine-editor.png` });
    await button('Save routine').click();
    await page.getByText(/^Active · next .*07:30$/).waitFor();
    const create = (await calls()).find(c => c.path === 'agents/v2/schedules' && c.body);
    assert.deepEqual({ ...create.body, agentId: undefined }, { agentId: undefined, prompt: 'Review new issues and list the ones that need me.',
      timezone: 'Europe/London', recurrence: { type: 'daily', time: '07:30' } });
    await page.getByRole('button', { name: /^Pause routine / }).click();
    await page.getByText('Paused', { exact: true }).waitFor();
    await page.getByRole('button', { name: /^History for routine / }).click();
    await page.getByText('Expired · your Mac stayed offline', { exact: true }).waitFor();
    await button('New trigger').click();
    assert.equal(await page.getByRole('radio', { name: 'GitHub issue', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByLabel('Repository', { exact: true }).fill('acme/web');
    await page.locator('.routine-editor').first().screenshot({ path: `${out}/${kind}-${theme}-trigger-editor.png` });
    await button('Save trigger').click();
    await page.getByText('Webhook URL', { exact: true }).first().waitFor();
    await page.locator('.webhook-card code').filter({ hasText: /\/hooks\/github\// }).waitFor();
    await page.getByText('fixture-secret-shown-once-0123456789abcdef', { exact: true }).waitFor();
    await button('Copy webhook url').first().waitFor(); await button('Copy secret').waitFor();
    await page.getByText('Content type: application/json.', { exact: true }).first().waitFor();
    const trigger = (await calls()).find(c => c.path === 'agents/v2/triggers' && c.body);
    assert.deepEqual(trigger.body.filter, { repository: 'acme/web', actions: ['opened'] });
    await page.setViewportSize({ width: 1280, height: 1500 }); await page.locator('.routines').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${kind}-${theme}-routines.png` }); await page.setViewportSize({ width: 1280, height: 800 });
    await button('I’ve saved it').click();
    assert.equal(await page.getByText('fixture-secret-shown-once-0123456789abcdef', { exact: true }).count(), 0, 'the secret is shown once');
    await page.getByRole('button', { name: /^Delete trigger / }).click(); await button('Delete trigger').click();
    await page.getByText('No triggers yet.', { exact: true }).waitFor();
    assert.equal((await calls()).find(c => c.method === 'DELETE')?.body, null, 'DELETE carries no body');
    assert.deepEqual(errors, []); await page.close();
  }
}

async function openAccess(page) {
  await page.getByRole('button', { name: /Website reviewer/ }).first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
}
