import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

const calls = (page, action) => page.evaluate(name => window.agentCalls.filter(x => x.action === name), action);

/** Agent v2 fixture path: exact approval, admission, cursor replay and an identical resend. */
export async function checkRunsV2({ open, out }) {
  let page = await open('v2');
  const button = name => page.getByRole('button', { name, exact: true });
  const input = name => page.getByRole('textbox', { name, exact: true });
  await button('Code reviewer, Ready').click();
  await page.getByText('team@example.com', { exact: true }).waitFor();
  await page.getByText('Version 2 ships today.', { exact: true }).waitFor();
  await capture(page, `${out}/v2-approval.png`);
  await button('Approve once').click();
  await page.getByText('Action completed', { exact: true }).waitFor();
  await page.getByText('Sent the release notes to the team.', { exact: true }).waitFor();
  assert.deepEqual((await calls(page, 'v2-decision')).map(c => [c.id, c.fingerprint, c.decision]),
    [['action-review-1', 'c'.repeat(64), 'allow']]);
  assert.equal((await calls(page, 'decision')).length, 0, 'v2 actions never reach the v1 decision route');
  await input('Message Code reviewer').fill('Draft the weekly summary.');
  await button('Send message').click();
  await page.getByText('Fixture v2 reply.', { exact: true }).waitFor();
  const [admit] = await calls(page, 'v2-admit');
  assert.deepEqual({ ...admit.body, idempotencyKey: undefined },
    { agentId: 'review', prompt: 'Draft the weekly summary.', attachments: [], idempotencyKey: undefined });
  assert.match(admit.body.idempotencyKey, /^[A-Za-z0-9._:-]{8,100}$/);
  const afters = (await calls(page, 'v2-events')).filter(c => c.id !== 'run-review-1').map(c => c.after);
  assert.equal(afters[0], 0); assert.ok(afters.slice(1).every(a => a === 2), `cursor replay resumes at 2: ${afters}`);
  await capture(page, `${out}/v2-conversation.png`);
  await page.close();

  page = await open('v2&admit-timeout');
  await page.getByRole('button', { name: 'Code reviewer, Ready', exact: true }).click();
  await page.getByRole('button', { name: 'Approve once', exact: true }).click();
  await page.getByText('Action completed', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Message Code reviewer', exact: true }).fill('Retry this exactly.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Fixture v2 reply.', { exact: true }).waitFor();
  const admits = await calls(page, 'v2-admit');
  assert.equal(admits.length, 2, 'the uncertain send is replayed once');
  assert.deepEqual(admits[1].body, admits[0].body, 'the replay reuses the key and exact body');
  await page.close();
}

/** Agent v2 routines: draft stays a draft until scheduled → server next-run preview → save → pause; a GitHub trigger shows its webhook. */
export async function checkRoutinesV2({ open, out }) {
  for (const theme of ['dark', 'light']) {
    const page = await open(`v2&theme=${theme}`); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const input = name => page.getByRole('textbox', { name, exact: true });
    const text = (value, exact = true) => page.getByText(value, { exact });
    await button('Code reviewer, Ready').click();
    await button('Edit').click();
    await page.getByRole('tab', { name: 'Access', exact: true }).click();
    await page.getByRole('heading', { name: 'Scheduled routines', exact: true }).waitFor();
    await button('Write my own routine').click();
    await input('Routine 1').fill('Every morning, list open pull requests.');
    await text('Draft · not running yet').first().waitFor();
    assert.equal((await calls(page, 'v2-schedule-create')).length, 0, 'a draft never becomes a schedule on its own');
    await button('Schedule routine 1').click();
    assert.equal(await input('Routine instructions').inputValue(), 'Every morning, list open pull requests.');
    await input('Routine time').fill('07:30');
    // The fixture's next runs are fixed at 1 Oct 07:30 (+01:00), so the wording depends on the day the check runs.
    await text('Next run: tomorrow, 07:30').or(text('Next run: today, 07:30')).or(text('Next run: Thu 1 Oct, 07:30')).waitFor();
    const [preview] = (await calls(page, 'v2-schedule-preview')).slice(-1);
    assert.deepEqual(preview.recurrence, { type: 'daily', time: '07:30' });
    assert.ok(preview.timezone.length > 0, 'defaults to the device zone');
    await capture(page, `${out}/${theme}-v2-schedule-preview.png`);
    await button('Save schedule').click();
    await text('Active · next', false).first().waitFor();
    const creates = await calls(page, 'v2-schedule-create');
    assert.equal(creates.length, 1);
    assert.equal(creates[0].body.prompt, 'Every morning, list open pull requests.');
    await text('Scheduled').waitFor();
    await button('Pause routine Every morning, list open pull requests.').click();
    await text('Paused').waitFor();
    await button('Show history for Every morning, list open pull requests.').click();
    await text('Expired · your Mac stayed offline').waitFor();
    await capture(page, `${out}/${theme}-v2-schedule-paused.png`);
    await button('Add a trigger').click();
    await input('GitHub repository').fill('acme/site');
    await button('Save trigger').click();
    await text('fixture-secret-shown-once').waitFor();
    await text(/hooks\/github\/123e4567/).first().waitFor();
    await button('Copy webhook url').waitFor(); await button('Copy webhook secret').waitFor();
    const [trigger] = await calls(page, 'v2-trigger-create');
    assert.deepEqual(trigger.body.filter, { repository: 'acme/site', actions: ['opened'] });
    await capture(page, `${out}/${theme}-v2-trigger-webhook.png`);
    await button('Dismiss webhook details').click();
    assert.equal(await text('fixture-secret-shown-once').count(), 0, 'the secret is shown once');
    assert.deepEqual(errors, []);
    await page.close();
  }
}
