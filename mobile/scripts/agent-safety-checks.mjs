import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

/** Browser honesty: the Access tab's browser block says live-connection-only sites do not work there. */
export async function checkBrowserNote({ open, out }) {
  for (const theme of ['dark', 'light']) {
    const page = await open(`v2&browser&theme=${theme}`);
    await page.getByRole('button', { name: 'Code reviewer, Ready', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('tab', { name: 'Access', exact: true }).click();
    const block = page.getByTestId('teammate-browser');
    await block.getByText('news.example.com', { exact: true }).waitFor();
    const note = block.getByText('Sites that work only over live connections, like chat apps and some dashboards, don’t work in your teammate’s browser.', { exact: true });
    await note.scrollIntoViewIfNeeded(); await note.waitFor();
    await capture(page, `${out}/${theme}-browser-sites.png`);
    await page.close();
  }
}

/**
 * Agent v2 security-review copy on the phone (docs/agent-v2-security-review.md):
 * F-07 approval cards name the account, plus a short connection id when several accounts are granted.
 */
export async function checkApprovalAccounts({ open, out }) {
  const card = async (search) => {
    const page = await open(search);
    await page.getByRole('button', { name: 'Code reviewer, Ready', exact: true }).click();
    await page.getByRole('button', { name: 'Approve once', exact: true }).waitFor();
    return page;
  };
  for (const theme of ['dark', 'light']) {
    const page = await card(`v2&two-gmail&theme=${theme}`);
    // Two Gmail accounts are granted: the line names the one this call runs as, by label and connection id.
    await page.getByText('Using team@example.com · c001', { exact: true }).waitFor();
    assert.equal(await page.getByText('Using team@example.com', { exact: true }).count(), 0, 'the id is never left off when several accounts are granted');
    await capture(page, `${out}/${theme}-approval-two-accounts.png`);
    await page.close();
  }
  const single = await card('v2');
  await single.getByText('Using team@example.com', { exact: true }).waitFor();
  assert.equal(await single.getByText('c001', { exact: false }).count(), 0, 'one granted account shows its label alone');
  await single.close();
}
