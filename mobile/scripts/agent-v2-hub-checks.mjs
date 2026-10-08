import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

const calls = (page, action) => page.evaluate(name => window.agentCalls.filter(x => x.action === name), action);
const c1 = '123e4567-e89b-42d3-a456-00000000c001';

/** Agent v2 connections hub: list + status pills, add-account, in-UI disconnect, MCP review/reads/add, and a teammate grant toggle. */
export async function checkConnectionsHubV2({ open, out }) {
  for (const theme of ['dark', 'light']) {
    let page = await open(`v2&theme=${theme}`); const errors = []; page.on('pageerror', e => errors.push(e.message));
    let button = name => page.getByRole('button', { name, exact: true });
    let text = (value, exact = true) => page.getByText(value, { exact });
    await page.getByRole('tab', { name: 'Code', exact: true }).click();
    await button('Open navigation menu').click();
    await button('Settings').click();
    // Settings -> Plugins opens the Integrations destination, which becomes the hub under v2.
    await page.getByRole('button', { name: /^Plugins/ }).first().click();
    await text('Connected accounts').waitFor();
    await text('team@example.com').waitFor();
    for (const pill of ['Connected', 'Reconnect needed', 'Changed — review']) await text(pill).first().waitFor();
    await text(/Used by Code reviewer · Used 2 h ago/).waitFor();
    await text('Vibyra hasn’t finished setting up sign-in for this service yet.').waitFor();
    assert.equal(await page.getByRole('button', { name: /^Slack, not available/ }).isDisabled(), true, 'an unavailable provider is not tappable');
    await capture(page, `${out}/${theme}-v2-hub.png`);

    // Add another Gmail account through the sign-in flow; the new account lands in the list.
    await button('Add another Gmail account').click();
    await text('new1@example.com').waitFor();
    const [start] = await calls(page, 'v2-connection-start');
    assert.equal(start.provider, 'gmail');

    // Disconnect confirms in the row, never through a browser dialog.
    page.on('dialog', () => assert.fail('no window.confirm/alert'));
    await button('Disconnect new1@example.com').click();
    await page.getByRole('alert').filter({ hasText: 'Disconnect new1@example.com?' }).waitFor();
    await capture(page, `${out}/${theme}-v2-hub-disconnect.png`);
    await button('Confirm disconnect new1@example.com').click();
    await text('new1@example.com').waitFor({ state: 'detached' });

    // MCP: changed tool list held for review, then approved; read-only tool marked as a read.
    await text(/This server’s tools changed \(1 added\)/).waitFor();
    await text('New · Delete page — Delete a page').waitFor();
    await capture(page, `${out}/${theme}-v2-mcp-review.png`);
    await button('Approve tool list for Docs MCP').click();
    await text(/This server’s tools changed/).waitFor({ state: 'detached' });
    const [approve] = await calls(page, 'v2-mcp-approve');
    assert.equal(approve.revision, 'b'.repeat(64));
    assert.equal(await page.getByRole('checkbox', { name: 'Treat Publish page as a read' }).count(), 0, 'only readOnlyHint tools can be reads');
    // F-25: marking a read is explained right where the choice is made.
    await text('A tool marked as a read runs without asking and sends what your teammate types to this server. Only mark tools you trust.').waitFor();
    await capture(page, `${out}/${theme}-v2-mcp-read-warning.png`);
    await page.getByRole('checkbox', { name: 'Treat Search docs as a read' }).click();
    await text('Read · runs without asking · Search the documentation').waitFor();
    assert.deepEqual((await calls(page, 'v2-mcp-reads'))[0].tools, ['mcp_ab12cd34__search_docs']);
    await page.getByRole('textbox', { name: 'MCP server address' }).fill('http://wiki.example.com/mcp');
    await button('Add MCP server').click(); await text('Use an https:// address.').waitFor();
    await page.getByRole('textbox', { name: 'MCP server address' }).fill('https://wiki.example.com/mcp');
    await button('Add MCP server').click(); await text('Wiki MCP').waitFor();
    await capture(page, `${out}/${theme}-v2-mcp-added.png`);

    // Teammate Access: connected ≠ allowed; ticking a write saves the exact grant.
    assert.deepEqual(errors, []); await page.close();
    page = await open(`v2&theme=${theme}`); page.on('pageerror', e => errors.push(e.message));
    button = name => page.getByRole('button', { name, exact: true }); text = (value, exact = true) => page.getByText(value, { exact });
    await button('Code reviewer, Ready').click(); await button('Edit').click();
    await page.getByRole('tab', { name: 'Access', exact: true }).click();
    await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
    await text('Connected · not allowed for this teammate').first().waitFor();
    await text('Allowed · read only').waitFor();
    await page.getByRole('checkbox', { name: 'Allow send for team@example.com' }).click();
    await text('Allowed · can ask to make changes').waitFor();
    const [put] = await calls(page, 'v2-grant-put');
    assert.deepEqual(put, { action: 'v2-grant-put', agentId: 'review', connectionId: c1, operations: ['gmail_read', 'gmail_search', 'gmail_send'] });
    await page.getByTestId('teammate-accounts').scrollIntoViewIfNeeded();
    await capture(page, `${out}/${theme}-v2-grants.png`);
    await page.getByRole('checkbox', { name: 'Allow reading team@example.com' }).click();
    await page.getByRole('checkbox', { name: 'Allow send for team@example.com' }).click();
    await page.waitForFunction(() => window.agentCalls.some(x => x.action === 'v2-grant-delete'));
    assert.deepEqual(errors, []);
    await page.close();
  }
}
