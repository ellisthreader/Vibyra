import assert from 'node:assert/strict';

export async function verifyAccountInstalls({ open, check, moreButton, dialog, shot, output }) {
  // 4. Nothing installed: More still has to be findable and honest.
  {
    const { page, errors } = await open('installed=');
    await check('More is there even with no optional CLI installed', async () => {
      await moreButton(page).click();
      await dialog(page).waitFor();
      assert.equal(await dialog(page).getByRole('switch').count(), 0);
      assert.equal(await dialog(page).getByRole('button', { name: 'Install' }).count(), 6);
    });
    await check('the one agent Vibyra cannot install shows its command instead', async () => {
      // Aider is a Python package, so an npm Install button would fail on
      // every machine. It gets the command spelled out and a way to copy it.
      const row = dialog(page).locator('.agent-row').filter({ hasText: 'Aider' });
      assert.ok((await row.innerText()).includes('pip install aider-chat'), 'aider command missing');
      assert.equal(await row.getByRole('button', { name: 'Copy' }).count(), 1);
      assert.equal(await row.getByRole('button', { name: 'Install' }).count(), 0, 'offered a button it cannot honour');
    });
    await shot(page, `${output}/dark-more-none.png`);
    await check('empty: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 5. Installing: the button runs npm, the row waits, and the agent lands.
  {
    const { page, errors } = await open('installed=&install=ok');
    await moreButton(page).click();
    await dialog(page).waitFor();
    const row = name => dialog(page).locator('.agent-row').filter({ hasText: name });
    await check('Install starts, reports itself, and finishes as a switch', async () => {
      await row('GitHub Copilot').getByRole('button', { name: 'Install' }).click();
      await row('GitHub Copilot').getByRole('button', { name: 'Installing…' }).waitFor();
      await row('GitHub Copilot').getByRole('switch').waitFor({ timeout: 10_000 });
    });
    await check('a landed agent can then be switched into the launcher', async () => {
      await row('GitHub Copilot').getByRole('switch').click();
      await page.waitForFunction(() => window.currentEnabled().includes('copilot'));
    });
    await shot(page, `${output}/dark-more-installed.png`);
    await check('install: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 6. A failed install has to stop and say so, not spin forever.
  {
    const { page, errors } = await open('installed=&install=fail');
    await moreButton(page).click();
    await dialog(page).waitFor();
    const row = dialog(page).locator('.agent-row').filter({ hasText: 'Crush' });
    await check('a failure shows npm own words and offers another go', async () => {
      await row.getByRole('button', { name: 'Install' }).click();
      await row.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 10_000 });
      assert.ok((await row.innerText()).includes('404'), 'the reason is not shown');
    });
    // Shot while the failure is on screen, not after it has been cleared.
    await shot(page, `${output}/dark-more-failed.png`);
    await check('dismissing the failure puts the Install button back', async () => {
      await row.getByRole('button', { name: 'Try again' }).click();
      await row.getByRole('button', { name: 'Install' }).waitFor();
    });
    await check('failure: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 7. A machine with no npm refuses up front rather than pretending.
  {
    const { page, errors } = await open('installed=&install=refuse');
    await moreButton(page).click();
    await dialog(page).waitFor();
    const row = dialog(page).locator('.agent-row').filter({ hasText: 'OpenCode' });
    await check('a refusal from Rust is shown on the row', async () => {
      await row.getByRole('button', { name: 'Install' }).click();
      await row.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 10_000 });
      assert.ok((await row.innerText()).toLowerCase().includes('npm'), 'the reason is not shown');
    });
    await check('refusal: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 8. Light theme, at the same real window width.
  {
    const { page, errors } = await open('light&installed=qwen,aider');
    await moreButton(page).click();
    await dialog(page).waitFor();
    await shot(page, `${output}/light-more-agents.png`);
    await check('light: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }
}
