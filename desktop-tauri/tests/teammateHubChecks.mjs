import assert from 'node:assert/strict';

const agent = '123e4567-e89b-42d3-a456-000000000001';
const gmail = '123e4567-e89b-42d3-a456-00000000c001';

/** Mac Agent v2 hub (Settings) and per-teammate grants (Access tab) against the shared phone fixture. */
export async function checkDesktopHub({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', () => errors.push('native dialog'));
    const button = name => page.getByRole('button', { name, exact: true });
    const text = (value, exact = true) => page.getByText(value, { exact });
    const calls = () => page.evaluate(() => window.fixture.inspect().hub.calls);
    await page.goto(`${url}/?v2&hub&${theme}`);
    await page.getByTestId('connections-hub').waitFor();
    await text('team@example.com').waitFor();
    for (const pill of ['Connected', 'Reconnect needed', 'Changed — review']) await text(pill).first().waitFor();
    await text('Vibyra hasn’t finished setting up sign-in for this service yet.').first().waitFor();
    assert.equal(await button('Connect Slack').count(), 0, 'an unavailable provider has no connect button');
    await page.screenshot({ path: `${out}/${kind}-${theme}-hub.png`, fullPage: true });
    await button('Add another Gmail account').click();
    await text('new1@example.com').waitFor();
    assert.equal((await calls()).find(c => c.action === 'v2-connection-start')?.provider, 'gmail');
    await button('Disconnect new1@example.com').click();
    await page.getByRole('alert').filter({ hasText: 'Disconnect new1@example.com?' }).waitFor();
    await button('Confirm disconnect new1@example.com').click();
    await text('new1@example.com').waitFor({ state: 'detached' });
    await text('New · Delete page — Delete a page').waitFor();
    await page.locator('.hub-review').screenshot({ path: `${out}/${kind}-${theme}-mcp-review.png` });
    await button('Approve tool list for Docs MCP').click();
    await page.locator('.hub-review').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('checkbox', { name: 'Treat Publish page as a read' }).count(), 0);
    // F-25: marking a read is explained right where the choice is made.
    await text('A tool marked as a read runs without asking and sends what your teammate types to this server. Only mark tools you trust.').waitFor();
    await page.locator('.hub-mcp').first().screenshot({ path: `${out}/${kind}-${theme}-mcp-read-warning.png` });
    await page.getByRole('checkbox', { name: 'Treat Search docs as a read' }).check();
    await text('Read · runs without asking · Search the documentation').waitFor();
    await page.getByRole('textbox', { name: 'MCP server address' }).fill('https://wiki.example.com/mcp');
    await button('Add MCP server').click(); await text('Wiki MCP').waitFor();
    assert.deepEqual((await calls()).filter(c => c.action.startsWith('v2-mcp')).map(c => c.action), ['v2-mcp-approve', 'v2-mcp-reads', 'v2-mcp-add']);
    assert.deepEqual(errors, []); await page.close();

    // Popular: one tap adds the preset's address and name, opens the sign-in in the browser, and the group then gives way to the account.
    const popular = await browser.newPage({ viewport: { width: 1280, height: 900 } }), popularErrors = [];
    popular.on('pageerror', e => popularErrors.push(e.message)); popular.on('dialog', () => popularErrors.push('native dialog'));
    await popular.goto(`${url}/?v2&hub&${theme}`);
    const group = popular.getByRole('region', { name: 'Popular' });
    await group.getByText('PayPal', { exact: true }).waitFor();
    assert.equal(await group.getByText('Notion', { exact: true }).count(), 1, 'a preset stands in for a built-in that cannot be connected');
    assert.equal(await popular.locator('.hub-provider').filter({ hasText: 'Notion' }).locator('button[aria-label="Connect Notion"]').count(), 0, 'no dead Connect for Notion');
    await popular.getByText('Slack', { exact: true }).waitFor(); assert.equal(await popular.getByRole('button', { name: 'Connect Slack', exact: true }).count(), 0);
    await group.screenshot({ path: `${out}/${kind}-${theme}-popular.png` });
    await group.getByRole('button', { name: 'Add PayPal', exact: true }).click();
    await popular.getByRole('heading', { name: 'PayPal', exact: true }).waitFor();
    assert.equal(await group.getByText('PayPal', { exact: true }).count(), 0, 'an added preset leaves the group');
    const added = (await popular.evaluate(() => window.fixture.inspect().hub.calls)).find(c => c.action === 'v2-mcp-add');
    assert.deepEqual([added.url, added.name], ['https://mcp.paypal.com/mcp', 'PayPal']);
    assert.equal((await popular.evaluate(() => window.fixture.inspect().hub.calls)).filter(c => c.action === 'v2-grant-put').length, 0, 'adding a service never grants teammate access');
    assert.ok((await popular.evaluate(() => window.fixture.inspect().overview.opened)).includes('about:blank#fixture-sign-in'), 'the sign-in opens in the browser');
    assert.deepEqual(popularErrors, []); await popular.close();
    const off = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await off.goto(`${url}/?v2&hub&no-presets&${theme}`); await off.getByTestId('connections-hub').waitFor(); await off.getByText('Add a service', { exact: true }).waitFor();
    assert.equal(await off.getByRole('region', { name: 'Popular' }).count(), 0, 'no presets, no Popular group'); await off.close();

    const access = await browser.newPage({ viewport: { width: 1280, height: 900 } }), accessErrors = [];
    access.on('pageerror', e => accessErrors.push(e.message));
    await access.goto(`${url}/?v2&grants&${theme}`);
    await access.getByRole('button', { name: /Website reviewer/ }).first().click();
    const details = access.getByRole('button', { name: 'Teammate details', exact: true }).first();
    if (await details.count()) await details.click();
    await access.getByRole('tab', { name: 'Access', exact: true }).click();
    await access.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
    await access.getByText('Connected · not allowed for this teammate', { exact: true }).first().waitFor();
    await access.getByRole('checkbox', { name: 'Allow reading team@example.com' }).check();
    await access.getByText('Allowed · read only', { exact: true }).waitFor();
    await access.getByRole('checkbox', { name: 'Allow send for team@example.com' }).check();
    await access.getByText('Allowed · can ask to make changes', { exact: true }).waitFor();
    const puts = (await access.evaluate(() => window.fixture.inspect().hub.calls)).filter(c => c.action === 'v2-grant-put');
    assert.deepEqual(puts.at(-1), { action: 'v2-grant-put', agentId: agent, connectionId: gmail, operations: ['gmail_read', 'gmail_search', 'gmail_send'] });
    // A reconnect-needed account cannot be allowed until it is signed in again; Popular and Add another live here too.
    await access.getByRole('button', { name: 'Reconnect personal@example.com', exact: true }).waitFor();
    assert.equal(await access.getByRole('checkbox', { name: 'Allow reading personal@example.com' }).count(), 0);
    await access.getByRole('button', { name: 'Add another Gmail account', exact: true }).waitFor();
    await access.locator('.teammate-accounts').screenshot({ path: `${out}/${kind}-${theme}-grants.png` });
    await access.getByRole('region', { name: 'Popular' }).getByRole('button', { name: 'Add PayPal', exact: true }).click();
    await access.locator('.teammate-accounts__group > header strong', { hasText: 'PayPal' }).waitFor();
    assert.deepEqual(accessErrors, []); await access.close();
  }
}
