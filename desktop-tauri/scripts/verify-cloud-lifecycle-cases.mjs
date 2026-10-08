import assert from 'node:assert/strict';

export async function verifyCloudLifecycle({ open, shot }) {
  {
    const page = await open('mode=offline');
    const nav = page.locator('.settings-nav__item').filter({ hasText: /^Cloud$/ });
    assert.equal(await nav.count(), 0, 'stored pairing and relay alone never expose Cloud');
    await page.getByRole('searchbox').fill('Vibyra Cloud');
    assert.equal(await page.locator('.settings-find__hit small').filter({ hasText: /^Cloud$/ }).count(), 0);
    await page.getByRole('searchbox').fill('');
    await page.evaluate(() => window.cloudFixture.connectPhone());
    await nav.waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Connect to cloud', exact: true }).count(), 0, 'connecting never auto-opens setup');
    await page.close();
  }
  {
    const page = await open('mode=notConnected');
    await page.getByRole('button', { name: 'Connect to cloud', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose projects for Vibyra Cloud' }).waitFor();
    await page.evaluate(() => window.cloudFixture.disconnectPhone());
    await page.getByRole('dialog', { name: 'Connect to cloud', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.some(c => c.command === 'cloud_sync_connect_mac')), false);
    await page.evaluate(() => window.cloudFixture.connectPhone());
    assert.equal(await page.getByRole('dialog', { name: 'Connect to cloud', exact: true }).count(), 0);
    await page.close();
  }
  {
    const page = await open('mode=notConnected&delayConnect');
    await page.getByRole('button', { name: 'Connect to cloud', exact: true }).click();
    await page.getByRole('button', { name: /^Next:/ }).click();
    await page.getByRole('button', { name: 'Next: review and connect' }).click();
    await page.getByTestId('cloud-consent').click();
    await page.getByRole('button', { name: 'Connect to cloud', exact: true }).last().click();
    await page.evaluate(() => { window.cloudFixture.disconnectPhone(); window.cloudFixture.connectPhone(); window.cloudFixture.finishConnect(); });
    await page.getByRole('dialog', { name: 'Connect to cloud', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.some(c => c.command === 'cloud_page_action')), false, 'stale connect completion cannot wake Cloud');
    await page.close();
  }
  {
    const page = await open('mode=connected');
    await page.getByText('Live', { exact: true }).waitFor();
    await page.evaluate(() => window.cloudFixture.secondPhone());
    assert.equal(await page.locator('.settings-nav__item').filter({ hasText: /^Cloud$/ }).count(), 1);
    await page.evaluate(() => window.cloudFixture.disconnectPhone());
    await page.locator('.settings-nav__item').filter({ hasText: /^Cloud$/ }).waitFor({ state: 'detached' });
    const before = await page.evaluate(() => window.cloudFixture.calls.filter(c => c.command.startsWith('cloud_')).length);
    await page.waitForTimeout(5500);
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.filter(c => c.command.startsWith('cloud_')).length), before, 'hidden page has no poll');
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.some(c => c.command === 'cloud_page_action' && ['stop', 'disconnect'].includes(c.payload.action))), false);
    await page.close();
  }
  {
    const page = await open('mode=connected'); await page.getByText('Live', { exact: true }).waitFor();
    await page.evaluate(() => window.cloudFixture.switchAccount());
    await page.locator('.settings-nav__item').filter({ hasText: /^Cloud$/ }).waitFor({ state: 'detached' });
    assert.equal(await page.getByText('HKE', { exact: true }).count(), 0, 'old account project state is gone'); await page.close();
  }
  console.log('PASS lifecycle: live-phone gating, no auto-open, disconnect races, multiple phones, account replacement, hidden polling');
}
