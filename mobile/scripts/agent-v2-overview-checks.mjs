import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';
import { checkTemplatesV2 } from './agent-v2-template-checks.mjs';

const calls = (page, action) => page.evaluate(name => window.agentCalls.filter(x => x.action === name), action);
const WIDE = [390, 844];
/** The seeded run waits for approval, which keeps the composer busy: decide it first, as a person would. */
const settle = async page => {
  await page.getByRole('button', { name: 'Approve once', exact: true }).click();
  await page.getByText('Action completed', { exact: true }).waitFor();
};
const tools = page => ({
  button: name => page.getByRole('button', { name, exact: true }),
  input: name => page.getByRole('textbox', { name, exact: true }),
  text: (value, exact = true) => page.getByText(value, { exact }),
});

/** Phase 8 on the phone: roster status + per-device read markers, the "What will it use?" card, activity, v2 attachments. */
export async function checkOverviewV2({ open, out }) {
  for (const theme of ['dark', 'light']) {
    const page = await open(`v2&overview&theme=${theme}`, ...WIDE); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const { button, input, text } = tools(page);
    // Roster: status words and dots come from GET /roster; "Finished" and "Needs your approval" are v2 run states.
    await button('Website helper, Finished').waitFor(); await button('Code reviewer, Needs your approval').waitFor();
    await page.getByLabel('Unread', { exact: true }).waitFor(); await page.getByLabel('Needs your approval', { exact: true }).waitFor();
    assert.ok((await calls(page, 'v2-roster')).length >= 1);
    await capture(page, `${out}/${theme}-v2-roster.png`);
    await button('Website helper, Finished').click();
    await page.waitForFunction(() => window.agentCalls.some(x => x.action === 'v2-read'));
    const [read] = await calls(page, 'v2-read');
    assert.equal(read.agentId, 'site'); assert.match(read.cursor, /^[a-f0-9]{64}$/);
    await button('Back to teammates').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Unread"]').length === 0);

    // The plan card: one calm line while typing; open it for accounts, approvals and gaps. Send never waits for it.
    await button('Code reviewer, Needs your approval').click();
    // Provider and account come from the server's own fields: "Send · Gmail", "Using team@example.com".
    await text('Send · Gmail').waitFor(); await text('Using team@example.com').waitFor();
    await settle(page);
    await input('Message Code reviewer').fill('Triage my inbox and draft replies.');
    const summary = button('What will it use? Can use Gmail · 1 action asks first');
    await summary.waitFor();
    assert.equal(await text('Reads: search, read · Asks first: send').count(), 0, 'closed until asked');
    await summary.click();
    await text('What it will use').waitFor(); await text('Gmail · work@acme.com').waitFor(); await text('Reads: search, read · Asks first: send').waitFor();
    await capture(page, `${out}/${theme}-v2-plan-card.png`);
    await input('Message Code reviewer').fill('Check my github notifications.');
    await button('What will it use? Needs setup before it can run').waitFor();
    assert.equal(await text('Needs attention').count(), 1, 'the card stays open while the draft changes');
    await text('No GitHub account is connected.').waitFor();
    assert.equal(await button('Send message').isDisabled(), false, 'a blocking gap never blocks Send');
    await capture(page, `${out}/${theme}-v2-plan-gap.png`);
    const planned = (await calls(page, 'v2-plan')).length;
    await button('Connect GitHub').click();
    await page.waitForFunction(n => window.agentCalls.filter(x => x.action === 'v2-plan').length > n, planned);
    assert.equal((await calls(page, 'v2-connection-start'))[0].provider, 'github');
    await input('Message Code reviewer').fill('Look at my calendar and slack.');
    await text('Choose what Code reviewer may do with me@acme.com.').waitFor();
    await text('Slack sign-in is not configured.').waitFor();
    assert.equal(await button('Connect Slack').count(), 0, 'an unavailable service has words, not a button');
    await input('Message Code reviewer').fill('Email overflow test.');
    await text(/1 tool was left out to keep this task under 10 tools/).waitFor();
    await text('Only 10 tools fit one task.').waitFor();
    await capture(page, `${out}/${theme}-v2-plan-dropped.png`);
    await input('Message Code reviewer').fill('Look at my calendar please.');
    await text('Choose what Code reviewer may do with me@acme.com.').waitFor();
    await button('Choose access').click();
    await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
    assert.equal((await calls(page, 'v2-grant-put')).length, 0, 'Choose access opens the tab and grants nothing');
    assert.deepEqual(errors, []); await page.close();
  }
  await checkSendAndAttachments({ open, out });
  await checkActivity({ open, out });
  await checkTemplatesV2({ open, out });
}

async function checkSendAndAttachments({ open, out }) {
  let page = await open('v2&overview', ...WIDE);
  let { button, input, text } = tools(page);
  await button('Code reviewer, Needs your approval').click(); await settle(page);
  await input('Message Code reviewer').fill('Summarise the attached notes and check my slack.');
  await button('What will it use? Needs setup before it can run').waitFor();
  const [file] = await Promise.all([page.waitForEvent('filechooser'), (await button('Add to chat').click(), button('Choose files').click())]);
  await file.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Release notes for the week.') });
  await button('Remove notes.txt').waitFor();
  assert.deepEqual((await calls(page, 'v2-upload')).map(c => c.name), ['notes.txt']);
  await text(/Attach up to/).count();
  await button('Send message').click();
  await text('Fixture v2 reply.').waitFor();
  const [admit] = await calls(page, 'v2-admit');
  assert.deepEqual(admit.body.attachments, [{ id: 'att-1' }], 'the run names the uploaded file by id');
  assert.equal(admit.body.prompt, 'Summarise the attached notes and check my slack.');
  assert.equal(await page.getByText(/\bused\b/).count(), 0, 'no tokens-used copy on a task that ran on the Mac’s own AI account');
  assert.equal((await calls(page, 'v2-plan')).every(c => c.attachments.every(id => /^att-\d+$/.test(id))), true);
  await capture(page, `${out}/v2-send-attachment.png`);
  await page.close();

  page = await open('v2&overview&no-runtime', ...WIDE); ({ button, input, text } = tools(page));
  await button('Code reviewer, Needs your approval').click(); await settle(page);
  await input('Message Code reviewer').fill('Write the weekly summary.');
  const words = 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.';
  await button('What will it use? Needs setup before it can run').click();
  await text(words).waitFor();
  assert.equal(await button('Choose AI account').count(), 0, 'the phone explains; only the Mac opens Settings');
  await capture(page, `${out}/v2-no-runtime.png`);
  await button('Send message').click();
  await page.waitForFunction(() => window.agentCalls.some(x => x.action === 'v2-admit'));
  assert.equal(await input('Message Code reviewer').inputValue(), 'Write the weekly summary.', 'a refused send keeps the draft');
  await page.getByRole('button', { name: /^What will it use\?/ }).waitFor();
  await page.close();

  page = await open('v2&overview&plan-fails', ...WIDE); ({ button, input, text } = tools(page));
  await button('Code reviewer, Needs your approval').click(); await settle(page);
  await input('Message Code reviewer').fill('Triage my inbox.');
  await page.waitForFunction(() => window.agentCalls.some(x => x.action === 'v2-plan'));
  assert.equal(await page.getByRole('button', { name: /^What will it use\?/ }).count(), 0, 'a failed plan shows nothing');
  await button('Send message').click(); await text('Fixture v2 reply.').waitFor();
  await page.close();

  page = await open('v2&overview&stale-read', ...WIDE); ({ button } = tools(page));
  await button('Website helper, Finished').click();
  await page.waitForFunction(() => window.agentCalls.filter(x => x.action === 'v2-read').length >= 2);
  const reads = await calls(page, 'v2-read');
  assert.notEqual(reads[0].cursor, reads[1].cursor, '409 stale_cursor: refresh the roster, then mark the new cursor');
  assert.equal(reads[1].cursor, 'b'.repeat(64));
  await page.close();
}

async function checkActivity({ open, out }) {
  for (const theme of ['dark', 'light']) {
    const page = await open(`v2&overview&theme=${theme}`, ...WIDE); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const { button, text } = tools(page);
    await button('Activity across your teammates').click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await text('Gmail · Send').waitFor();
    assert.equal(await button('Gmail Send, Done, by Code reviewer').count(), 1);
    await page.getByRole('link', { name: 'Open in Gmail', exact: true }).waitFor();
    await capture(page, `${out}/${theme}-v2-activity.png`);
    await button('Load more').click();
    await text('Slack · Post message').waitFor();
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'service text is never markup');
    await text('<img src=x onerror=window.__xss=1>Posted <b>to #general</b>').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open in Slack' }).count(), 0, 'a javascript: receipt address is not a link');
    assert.equal(await page.getByRole('link', { name: 'Open in Google Calendar' }).count(), 0, 'an address off the provider’s own host is not a link');
    await button('Slack Post message, Unconfirmed, by Code reviewer').waitFor();
    await capture(page, `${out}/${theme}-v2-activity-more.png`);
    await button('GitHub').click();
    await text('GitHub · Comment issue').waitFor();
    assert.equal(await text('Gmail · Send').count(), 0);
    assert.equal((await calls(page, 'v2-activity')).at(-1).filters.provider, 'github');
    await button('Website helper').click();
    await text('GitHub · Create issue').waitFor();
    assert.deepEqual((await calls(page, 'v2-activity')).at(-1).filters, { provider: 'github', agentId: 'site', cursor: null });
    await button('All services').click(); await button('All teammates').click();
    await button('Gmail Send, Done, by Code reviewer').click();
    await page.getByRole('textbox', { name: 'Message Code reviewer', exact: true }).waitFor();
    await button('Back to teammates').click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    assert.deepEqual(errors, []); await page.close();
  }
}
