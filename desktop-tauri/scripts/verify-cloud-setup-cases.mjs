import assert from 'node:assert/strict';

async function enter(page) {
  await page.getByRole('button', { name: 'Connect to cloud', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose projects for Vibyra Cloud' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.cc-footer .cc-button')?.disabled);
}
async function agree(page, noAccounts = false) {
  await page.getByRole('button', { name: /^Next:/ }).click();
  if (!noAccounts) await page.getByRole('button', { name: 'Next: review and connect' }).click();
  await page.getByTestId('cloud-consent').click();
}
async function connect(page) {
  await page.getByRole('button', { name: 'Connect to cloud', exact: true }).last().evaluate(button => { button.click(); button.click(); });
  await page.getByRole('button', { name: 'Done', exact: true }).last().waitFor();
}
export async function verifyCloudSetup({ open, shot }) {
  for (const theme of ['dark', 'light']) {
    const page = await open('mode=notConnected', theme, true);
    await enter(page); await shot(page, `setup-projects-${theme}-960`);
    assert.equal(await page.getByRole('checkbox', { name: 'Send HKE', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('checkbox', { name: 'Send Vibyra', exact: true }).click();
    await page.getByRole('button', { name: /^Next:/ }).click();
    await page.getByRole('checkbox', { name: 'Bring Claude to Vibyra Cloud' }).click();
    await page.getByRole('checkbox', { name: 'Bring GitHub to Vibyra Cloud' }).click();
    await shot(page, `setup-accounts-${theme}-960`);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Send Vibyra', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: /^Next:/ }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Bring Claude to Vibyra Cloud' }).getAttribute('aria-checked'), 'false');
    await page.getByRole('button', { name: 'Next: review and connect' }).click();
    const submit = page.getByRole('button', { name: 'Connect to cloud', exact: true }).last();
    assert.equal(await submit.isDisabled(), true);
    await page.getByTestId('cloud-consent').click();
    await shot(page, `setup-review-${theme}-960`);
    const box = await submit.boundingBox(); assert.ok(box.y + box.height <= 600, 'Connect stays inside the minimum window');
    await connect(page);
    await page.getByRole('heading', { name: 'Syncing…', exact: true }).waitFor();
    const calls = await page.evaluate(() => window.cloudFixture.calls);
    const connects = calls.filter(c => c.command === 'cloud_sync_connect_mac');
    assert.equal(connects.length, 1, 'double click creates one consent attempt');
    assert.deepEqual(connects[0].payload.accounts, { claude: false, codex: true, github: false });
    assert.equal(connects[0].payload.consentVersion, 3);
    assert.equal(calls.filter(c => c.command === 'cloud_page_action' && c.payload.action === 'wake').length, 1);
    await page.evaluate(() => window.cloudFixture.land(1));
    await page.waitForTimeout(3200);
    assert.equal(await page.getByRole('heading', { name: 'You’re in the cloud.' }).count(), 0, 'one of two receipts cannot land all projects');
    await page.evaluate(() => window.cloudFixture.land(2));
    await page.getByRole('heading', { name: 'You’re in the cloud.' }).waitFor();
    await shot(page, `setup-ready-${theme}`);
    await page.getByRole('button', { name: 'Done', exact: true }).last().click();
    await page.getByRole('heading', { name: 'Vibyra Cloud', exact: true }).waitFor();
    await page.getByText('Live', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Close Vibyra Cloud' }).evaluate(el => el === document.activeElement), true, 'Done focuses the Cloud page');
    await shot(page, `updates-${theme}`); await page.close();
  }
  {
    const page = await open('mode=notConnected&empty&noaccounts');
    await enter(page); await agree(page, true); await connect(page);
    const call = await page.evaluate(() => window.cloudFixture.calls.find(c => c.command === 'cloud_sync_connect_mac'));
    assert.deepEqual(call.payload.projects, [], 'empty is never select all');
    assert.deepEqual(call.payload.accounts, {}); await page.close();
  }
  {
    const page = await open('mode=notConnected&long', 'dark', true); await enter(page);
    await page.getByRole('checkbox', { name: /^Send Project 35 / }).scrollIntoViewIfNeeded();
    const next = await page.getByRole('button', { name: /^Next:/ }).boundingBox();
    assert.ok(next.y >= 0 && next.y + next.height <= 600);
    assert.equal(await page.locator('.cc-modal').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await shot(page, 'setup-long-projects'); await page.close();
  }
  {
    const page = await open('mode=notConnected&wakeFail'); await enter(page); await agree(page); await connect(page);
    await page.getByText('Cloud could not start. Try again.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Try starting Cloud again' }).click();
    await page.getByRole('heading', { name: 'Syncing…', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.filter(c => c.command === 'cloud_sync_connect_mac').length), 1);
    await page.close();
  }
  {
    const page = await open('mode=notConnected&consentFail'); await enter(page); await agree(page);
    await page.getByRole('button', { name: 'Connect to cloud', exact: true }).last().click();
    await page.getByRole('alert').filter({ hasText: 'The cloud terms changed' }).waitFor();
    assert.equal(await page.getByTestId('cloud-consent').getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => window.cloudFixture.calls.some(c => c.command === 'cloud_page_action')), false);
    await page.close();
  }
  {
    const page = await open('mode=notConnected&existing'); await enter(page);
    const retained = page.getByRole('checkbox', { name: 'Send Vibyra', exact: true });
    assert.equal(await retained.isDisabled(), true); assert.equal(await retained.getAttribute('aria-checked'), 'true');
    await agree(page); await connect(page);
    const ids = await page.evaluate(() => window.cloudFixture.calls.find(c => c.command === 'cloud_sync_connect_mac').payload.projects.map(p => p.id));
    assert.deepEqual(ids.sort(), ['p0', 'p1', 'p3', 'p4'], 'renewed consent retains existing grants without adding unchosen projects');
    await page.close();
  }
  console.log('PASS setup: minimum window, choices, single submission, receipt readiness, zero projects, wake retry, changed terms');
}
