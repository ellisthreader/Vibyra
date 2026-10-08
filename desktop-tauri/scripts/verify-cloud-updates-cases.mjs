import assert from 'node:assert/strict';

const callCount = (page, command, action) => page.evaluate(({ command, action }) => window.cloudFixture.calls
  .filter(c => c.command === command && (!action || c.payload.action === action)).length, { command, action });
const back = page => page.locator('.cloud-page__back').click();

export async function verifyCloudUpdates({ open, shot }) {
  {
    const page = await open();
    await page.getByRole('button', { name: 'Close Vibyra Cloud' }).click();
    await page.evaluate(() => window.cloudFixture.disconnectPhone());
    const denied = await page.evaluate(() => window.cloudFixture.runTool('open_panel', { panel: 'settings', section: 'cloud' }));
    assert.equal(denied.failed, true); assert.match(denied.detail, /approved phone/);
    assert.equal(await page.getByRole('dialog', { name: 'Settings', exact: true }).count(), 0, 'assistant cannot open Cloud settings without a phone');
    await page.evaluate(() => window.cloudFixture.connectPhone());
    assert.equal(await page.getByRole('dialog', { name: 'Settings', exact: true }).count(), 0, 'phone reconnect never opens settings');
    const opened = await page.evaluate(() => window.cloudFixture.runTool('open_panel', { panel: 'settings', section: 'cloud' }));
    assert.equal(opened.failed, undefined); await page.getByTestId('cloud-live').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Connect to cloud', exact: true }).count(), 0, 'assistant opens the Cloud page without starting setup');
    await page.getByRole('button', { name: 'Close Vibyra Cloud' }).click();
    await page.evaluate(() => window.cloudFixture.disconnectPhone());
    const general = await page.evaluate(() => window.cloudFixture.runTool('open_panel', { panel: 'settings', section: 'general' }));
    assert.equal(general.failed, undefined); await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await page.getByTestId('cloud-live').count(), 0, 'ordinary settings stay available without a phone');
    await page.close();
  }
  for (const light of [false, true]) {
    const theme = light ? 'light' : 'dark';
    const page = await open('changes', light, true);
    await page.getByRole('heading', { name: 'Vibyra Cloud is syncing…' }).waitFor();
    const bounds = await page.locator('.settings-pane__body--cloud').boundingBox();
    for (const row of (await page.getByTestId('cloud-live').locator('.cloud-page__project').all()).slice(0, 2)) {
      const box = await row.boundingBox(); assert.ok(box.y + box.height <= bounds.y + bounds.height + 1, 'two Live projects fit at 960×600');
    }
    await shot(page, `live-${theme}-960`);
    await page.getByTestId('cloud-row-accounts').click();
    await page.getByTestId('cloud-accounts').waitFor();
    assert.equal(await page.locator('.cloud-page__back').evaluate(e => e === document.activeElement), true, 'nested page receives keyboard focus');
    const codex = page.getByRole('switch', { name: 'Use Codex in Vibyra Cloud' });
    await codex.click(); await page.waitForFunction(() => window.cloudFixture.calls.some(c => c.command === 'cloud_page_action' && c.payload.provider === 'codex' && c.payload.enabled === false));
    await page.waitForFunction(() => document.querySelector('[aria-label="Use Codex in Vibyra Cloud"]').getAttribute('aria-checked') === 'false');
    await codex.click();
    await page.getByRole('button', { name: 'Allow Codex in Vibyra Cloud' }).click();
    await page.getByText('Click Allow on the Codex page that opened in your browser.').waitFor();
    await page.getByRole('button', { name: 'Stop signing in to Codex' }).click();
    assert.equal(await callCount(page, 'cloud_logins_allow'), 1); assert.equal(await callCount(page, 'cloud_logins_stop'), 1);
    await shot(page, `accounts-${theme}-960`);
    await back(page);
    assert.equal(await page.getByTestId('cloud-row-accounts').evaluate(e => e === document.activeElement), true, 'Back returns focus to its row');
    await page.getByTestId('cloud-row-capacity').click();
    await page.getByRole('heading', { name: 'Cloud capacity', exact: true }).waitFor();
    await page.getByText('1.1 GB of 4.7 GB', { exact: true }).waitFor();
    await shot(page, `capacity-${theme}-960`); await back(page);
    await page.getByTestId('cloud-row-computer').click();
    const pause = page.getByRole('switch', { name: 'Pause syncing on this Mac' });
    await pause.click(); await page.waitForFunction(() => document.querySelector('[aria-label="Pause syncing on this Mac"]').getAttribute('aria-checked') === 'true');
    const env = page.getByRole('switch', { name: 'Include .env files', exact: true });
    await env.click(); await page.getByRole('alertdialog', { name: 'Include .env files?' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await callCount(page, 'cloud_sync_set_options'), 0, 'cancelled .env opt-in sends no mutation');
    await env.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Include .env files', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Include .env files"]').getAttribute('aria-checked') === 'true');
    await shot(page, `computer-${theme}-960`); await back(page);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const hke = page.getByRole('checkbox', { name: 'HKE in Vibyra Cloud', exact: true });
    await hke.click(); const remove = page.getByRole('alertdialog', { name: 'Remove HKE from Vibyra Cloud?' }); await remove.waitFor();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    assert.equal(await remove.evaluate(e => e.contains(document.activeElement)), true, 'confirmation traps focus');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await hke.getAttribute('aria-checked'), 'true'); assert.equal(await callCount(page, 'cloud_sync_set_project'), 0);
    await hke.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="HKE in Vibyra Cloud"]').getAttribute('aria-checked') === 'false');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Review 2 Cloud changes', exact: true }).click();
    await page.getByText('src/main.ts', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'src/conflict.ts Conflict · kept on this computer' }).click();
    await page.getByText("This computer's changes", { exact: true }).waitFor(); await page.getByText("Cloud's changes", { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Apply safe changes', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Apply safe changes', exact: true }).click();
    await page.getByText('1 change applied', { exact: true }).waitFor();
    const apply = await page.evaluate(() => window.cloudFixture.calls.find(c => c.command === 'cloud_sync_change_apply').payload);
    assert.deepEqual(apply, { projectId: 'p0', seq: 7, digest: 'review-digest', confirmed: true });
    await shot(page, `changes-${theme}-960`); await back(page);
    await page.getByRole('button', { name: 'Stop Vibyra Cloud' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Stop Cloud', exact: true }).click();
    await page.getByRole('button', { name: 'Start Vibyra Cloud' }).waitFor();
    await page.getByRole('button', { name: 'Start Vibyra Cloud' }).click();
    await page.getByRole('button', { name: 'Stop Vibyra Cloud' }).waitFor();
    await page.getByTestId('cloud-row-delete').click();
    await page.getByRole('button', { name: 'Delete everything', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Delete everything in Vibyra Cloud?' }).waitFor();
    await shot(page, `delete-${theme}-960`); await page.keyboard.press('Escape');
    assert.equal(await callCount(page, 'cloud_page_action', 'disconnect'), 0, 'delete destination and cancelled confirmation never purge');
    await page.getByRole('button', { name: 'Delete everything', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete everything', exact: true }).click();
    await page.getByRole('button', { name: 'Connect to cloud', exact: true }).waitFor();
    assert.equal(await callCount(page, 'cloud_page_action', 'disconnect'), 1); await page.close();
  }
  {
    const page = await open();
    await page.evaluate(() => window.cloudFixture.phase('p1', 'needs_attention'));
    await page.getByRole('button', { name: 'Sync HKE again' }).waitFor();
    await page.getByRole('button', { name: 'Sync HKE again' }).click();
    await page.getByRole('button', { name: 'Sync HKE again' }).waitFor({ state: 'detached' });
    assert.equal(await callCount(page, 'cloud_page_action', 'repair'), 1);
    await page.evaluate(() => window.cloudFixture.unavailable());
    await page.getByText('Cloud updates could not be loaded', { exact: true }).waitFor();
    await page.evaluate(() => window.cloudFixture.recover());
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByText('Cloud updates could not be loaded', { exact: true }).waitFor({ state: 'detached' });
    await shot(page, 'live-dark-large');
    await page.close();
  }
  {
    const page = await open('long', true, true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const choices = page.getByRole('checkbox'); assert.equal(await choices.count(), 35);
    await choices.last().scrollIntoViewIfNeeded(); await shot(page, 'edit-long-light-960');
    const overflow = await page.locator('.settings-pane__body--cloud').evaluate(e => ({ width: e.clientWidth, scrollWidth: e.scrollWidth }));
    assert.ok(overflow.scrollWidth <= overflow.width + 1, 'long choices never overflow horizontally');
    await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.getByTestId('cloud-live').waitFor();
    await page.close();
  }
  {
    const page = await open();
    await page.getByRole('searchbox').fill('cloud accounts');
    await page.getByRole('option').filter({ hasText: /AI accounts/ }).click();
    await page.getByTestId('cloud-accounts').waitFor();
    await page.getByRole('searchbox').fill('cloud delete');
    await page.getByRole('option').filter({ hasText: /Delete everything/ }).click();
    await page.getByTestId('cloud-delete').waitFor();
    assert.equal(await callCount(page, 'cloud_page_action', 'disconnect'), 0, 'search only opens the delete explanation');
    await back(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('[data-visible="false"]').waitFor();
    const before = await callCount(page, 'cloud_overview');
    await page.waitForTimeout(3500); assert.equal(await callCount(page, 'cloud_overview'), before, 'background page does not poll');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(before => window.cloudFixture.calls.filter(c => c.command === 'cloud_overview').length > before, before);
    await page.close();
  }
  console.log('PASS updates: real provider choices/logins, capacity, transfer privacy, project confirmation, safe conflict review, stop/start, repair, failed polling recovery, account-wide delete, focus and long names');
}
