import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

export async function setupTeammate(page, name, job, routine = false) {
  const button = name => page.getByRole('button', { name, exact: true });
  const input = name => page.getByRole('textbox', { name, exact: true });
  assert.equal(await page.getByRole('dialog', { name: 'New teammate' }).count(), 0);
 await input('Teammate task').fill(job);
  await page.getByRole('tab', { name: 'Memory', exact: true }).click(); await input('Teammate memory').fill('Prefer concise answers with sources.');

  if (routine) { await page.getByRole('tab', { name: 'Access', exact: true }).click(); await button('Write my own routine').click(); await input('Routine 1').fill('Friday: review my notes.'); }
  await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await input('Teammate name').fill(name);
}

export async function checkSetup(page, out) {
  const button = name => page.getByRole('button', { name, exact: true });
  const input = name => page.getByRole('textbox', { name, exact: true });
  await button('New teammate').click();
  for (const label of ['Profile', 'Skills', 'Memory', 'Access']) await page.getByRole('tab', { name: label, exact: true }).waitFor();
  assert.equal(await button('Create teammate').isDisabled(), true);
  assert.equal(await input('Teammate task').count(), 1, 'profile fields are immediately available');
  await capture(page, `${out}/empty-overview.png`);
  await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await page.getByRole('radio', { name: 'Anthropic', exact: true }).click(); assert.equal(await page.getByRole('radio', { name: 'Anthropic', exact: true }).isChecked(), true, 'engine immediately selected');
  await page.getByRole('tab', { name: 'Skills', exact: true }).click(); await page.getByRole('checkbox', { name: 'Review checklist', exact: true }).click();
  await page.getByRole('tab', { name: 'Memory', exact: true }).click(); await input('Teammate memory').fill('Keep my preferences.');
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); await input('Vibes per task').fill('10');
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); await page.getByRole('checkbox', { name: 'Allow GitHub' }).click();
 await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await input('Teammate name').fill('Accessibility helper');
  await input('Teammate task').fill('Research accessibility changes in one product.');
  await button('Back to teammates').click(); await button('New teammate').click();
  assert.match(await input('Teammate task').inputValue(), /accessibility/);
  await page.reload(); await button('New teammate').click();
  assert.match(await input('Teammate task').inputValue(), /accessibility/, 'unsent setup survives restart');

  await page.getByRole('tab', { name: 'Profile', exact: true }).click(); assert.equal(await page.getByRole('radio', { name: 'Anthropic', exact: true }).isChecked(), true);
  await page.getByRole('tab', { name: 'Skills', exact: true }).click(); assert.equal(await page.getByRole('checkbox', { name: 'Review checklist', exact: true }).isChecked(), true);
  await page.getByRole('tab', { name: 'Memory', exact: true }).click(); assert.equal(await input('Teammate memory').inputValue(), 'Keep my preferences.');
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); assert.equal(await input('Vibes per task').inputValue(), '10');
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Allow GitHub' }).isChecked(), true, 'choosing a job preserves explicit tool grants');
  await page.getByRole('checkbox', { name: 'Allow GitHub' }).click();
  assert.equal(await button('Create teammate').isEnabled(), true, 'one job is enough to create a teammate');
  await page.getByRole('tab', { name: 'Memory', exact: true }).click(); await button('Use my name & timezone').click(); await button('Keep it concise').click();
  assert.match(await input('Teammate memory').inputValue(), /Timezone:/);
  await capture(page, `${out}/memory-editor.png`);
  await input('Teammate memory').fill('');
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Allow GitHub' }).isChecked(), false, 'connections never imply a grant');
  await page.getByRole('checkbox', { name: 'Allow GitHub' }).click();
  await button('Other tool plans').click(); await input('Planned tools').fill('Slack and calendar');
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); assert.equal(await input('Planned tools').inputValue(), 'Slack and calendar');
  assert.equal(await page.getByRole('checkbox', { name: 'Allow GitHub' }).isChecked(), true);
  await page.getByRole('checkbox', { name: 'Allow GitHub' }).click();
  await capture(page, `${out}/tools-editor.png`);
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); await button('Write my own routine').click();
  const routine = 'Friday 09:00 Europe/Malta: review my supplied notes.\nNotify me only about unresolved decisions.';
  await input('Routine 1').fill(routine); await button('Add a second routine').click(); await input('Routine 2').fill('Monthly: review priorities.');
  assert.equal(await button('Add a second routine').count(), 0);
  await button('Remove routine 2').click(); await capture(page, `${out}/routine-editor.png`);
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  assert.equal(await input('Routine 1').inputValue(), routine, 'multiline routines stay one intact plan');

  await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await input('Teammate name').fill('Accessibility helper');
  await page.getByRole('radio', { name: 'qa avatar', exact: true }).click();
  await capture(page, `${out}/completed-preview.png`);
  await button('Create teammate').click(); await input('Message Accessibility helper').waitFor();
  const created = (await page.evaluate(() => window.agentCalls)).find(x => x.action === 'save');
  assert.deepEqual(created.fields.integrations, []); assert.equal(created.fields.memory, ''); assert.equal(created.fields.avatar, 'qa');
  assert.equal(created.fields.routines, undefined);
  await button('Teammate details').click();
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); assert.equal(await input('Planned tools').inputValue(), 'Slack and calendar');
  await page.getByRole('tab', { name: 'Access', exact: true }).click(); assert.equal(await input('Routine 1').inputValue(), routine);
}
