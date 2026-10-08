import assert from 'node:assert/strict';

export async function verifyDesktopProfile({ open, t, shot, theme }) {
  const { page, errors } = await open(`${t}running`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Updated fixture');
  assert.equal(await page.locator('input[aria-label="Current password"]').count(), 0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Profile saved.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.accountState().profile.name), 'Updated fixture');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('changed@example.test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Enter your current password to change your email.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.accountEvents.filter(e => e[0] === 'account_profile_update').length), 1);
  await page.locator('input[aria-label="Current password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.accountEvents.filter(e => e[0] === 'account_profile_update').length === 2);
  await page.waitForFunction(() => document.querySelector('input[type=password]')?.value === '');
  assert.equal(await page.evaluate(() => window.accountState().status), 'signedIn');
  assert.equal(await page.evaluate(() => window.accountState().profile.email), 'barbara@example.test');
  assert.equal(await page.evaluate(() => window.accountPanes()[0].status), 'running');
  assert.equal(await page.getByRole('textbox', { name: 'Email address', exact: true }).inputValue(), 'changed@example.test');
  await shot(page, `profile-password-rejected-${theme}`);
  await page.locator('input[aria-label="Current password"]').fill('fixture-correct-password');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Email not verified', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.accountState().profile.email), 'changed@example.test');
  assert.equal(await page.evaluate(() => window.accountPanes()[0].status), 'running');
  assert.equal(await page.locator('input[aria-label="Current password"]').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
  const provider = await open(`${t}provider=google&2fa=provider`);
  await provider.page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await provider.page.getByRole('textbox', { name: 'Email address', exact: true }).isDisabled(), true);
  assert.equal(await provider.page.locator('input[aria-label="Current password"]').count(), 0);
  assert.deepEqual(provider.errors, []);
  await provider.page.close();
}
