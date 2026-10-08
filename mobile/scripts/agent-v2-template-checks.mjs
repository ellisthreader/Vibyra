import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

const WIDE = [390, 844];
const calls = (page, action) => page.evaluate(name => window.agentCalls.filter(x => x.action === name), action);
const tools = page => ({
  button: name => page.getByRole('button', { name, exact: true }),
  text: (value, exact = true) => page.getByText(value, { exact }),
});

/** Starter teammates: pick one, get suggestions (never grants), one-tap "Set up…" into the real editors, idempotent retry. */
export async function checkTemplatesV2({ open, out }) {
  for (const theme of ['dark', 'light']) {
    const page = await open(`v2&overview&theme=${theme}`, ...WIDE); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const { button, text } = tools(page);
    await button('New teammate').click();
    await text('Start from a template').waitFor();
    for (const name of ['Inbox triage', 'PR shepherd', 'Morning brief', 'Meeting prep']) await page.getByRole('button', { name: new RegExp(`^${name}\\.`) }).waitFor();
    await capture(page, `${out}/${theme}-v2-templates.png`);
    await page.getByRole('button', { name: /^Morning brief\./ }).click();
    await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
    await text('Suggested for Morning brief').first().waitFor();
    await text('Reads today’s meetings.').waitFor();
    await button('Connect Google Calendar').waitFor();
    await text('Connected', true).first().waitFor();
    await text('Suggested · search and read').first().waitFor();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'suggestions are never pre-ticked');
    assert.equal((await calls(page, 'v2-grant-put')).length + (await calls(page, 'v2-schedule-create')).length, 0, 'nothing is granted or scheduled');
    const [created] = await calls(page, 'v2-template-create');
    assert.equal(created.key, 'morning_brief'); assert.match(created.id, /^[0-9a-f-]{36}$/);
    await capture(page, `${out}/${theme}-v2-template-suggestions.png`);
    await text('Weekdays at 08:00').scrollIntoViewIfNeeded();
    await button('Set up this routine').click();
    assert.equal(await page.getByRole('textbox', { name: 'Routine time', exact: true }).inputValue(), '08:00');
    assert.equal(await page.getByRole('textbox', { name: 'Routine instructions', exact: true }).inputValue(), 'Write my morning brief for today.');
    assert.equal((await calls(page, 'v2-schedule-create')).length, 0, 'Set up opens the editor; saving is the person’s own step');
    await capture(page, `${out}/${theme}-v2-template-routine.png`);
    await button('Cancel scheduling').click();
    await button('Dismiss suggestions').click();
    await text('Suggested for Morning brief').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []); await page.close();
  }
  let page = await open('v2&overview&template-timeout', ...WIDE); const { button } = tools(page);
  await button('New teammate').click();
  await page.getByRole('button', { name: /^PR shepherd\./ }).click();
  await page.getByText('Connection interrupted.').waitFor();
  await page.getByRole('button', { name: /^PR shepherd\./ }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
  const creates = await calls(page, 'v2-template-create');
  assert.equal(creates.length, 2); assert.equal(creates[0].id, creates[1].id, 'a retried create keeps its id');
  await button('Connect GitHub').waitFor();
  await page.getByRole('button', { name: 'Set up this trigger', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'GitHub actions', exact: true }).inputValue(), 'opened, ready_for_review');
  assert.equal((await calls(page, 'v2-trigger-create')).length, 0);
  await page.close();
}
