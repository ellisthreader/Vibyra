import assert from 'node:assert/strict';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

/**
 * F-31 in the real Access tab (teammateProfileFixture): a normal project folder is granted as before; the home
 * folder, a disk root and ~/Documents grant nothing until the person confirms, then only read-only, and edits are
 * not offered while the warning is open. This build has no shell tests: the checkbox is never offered (even though
 * the fixture roster reports the server's vmTests capability) and allowTests is never sent true.
 */
export async function checkBroadFolders({ browser, url, out }) {
  for (const theme of ['dark', 'light']) {
    const p = await browser.newPage({ viewport: { width: 1100, height: 800 }, userAgent: MAC });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    const grant = p.getByRole('region', { name: 'Agent Computer', exact: true }), warning = grant.getByRole('group', { name: 'Broad folder warning' });
    const button = name => grant.getByRole('button', { name, exact: true });
    const edits = grant.getByRole('checkbox', { name: /Allow proposed file edits/ }), shell = grant.getByRole('checkbox', { name: /Allow proposed shell tests/ });
    const pick = path => p.evaluate(path => window.fixturePick(path), path);
    const calls = () => p.evaluate(() => window.fixtureChooseCalls());
    const granted = () => p.evaluate(() => window.fixtureComputer());
    const reopen = async () => { if (!(await grant.isVisible())) { await p.getByRole('button', { name: 'Edit', exact: true }).click(); await p.getByRole('tab', { name: 'Access', exact: true }).click(); } await grant.waitFor(); };
    const revoke = async () => { await reopen(); await button('Remove access').click(); assert.equal(await granted(), null); };
    await p.goto(`${url}/?computer${theme === 'light' ? '&light' : ''}`);
    await p.getByRole('button', { name: 'New teammate', exact: true }).last().click();
    await p.getByLabel('Name', { exact: true }).fill('Computer helper');
    await p.getByLabel('Brief', { exact: true }).fill('Review this project with exact approval.');
    await p.getByRole('button', { name: 'Create teammate', exact: true }).click();
    await reopen();

    // A normal project folder behaves exactly as before: no warning, the chosen access goes through.
    await edits.check(); assert.equal(await shell.count(), 0, 'no shell-tests checkbox in this build, even with the vmTests capability'); await pick('/fixture/project'); await button('Choose folder').click();
    await p.waitForFunction(() => Boolean(window.fixtureComputer?.()));
    assert.equal(await warning.count(), 0);
    assert.deepEqual(await granted().then(g => [g.path, g.canWrite, g.canTest]), ['/fixture/project', true, false]);
    assert.deepEqual((await calls()).map(c => ({ ...c, agentId: 'x' })), [{ agentId: 'x', allowEdits: true, allowTests: false }]);
    await revoke();

    // The home folder: nothing is granted, edits are not offered, and the grant needs an explicit tick.
    await reopen(); await pick('/Users/fixture'); await edits.check(); await button('Choose folder').click();
    await warning.waitFor();
    assert.match(await warning.textContent(), /This is your whole home folder\./);
    assert.match(await warning.textContent(), /\/Users\/fixture/);
    assert.match(await warning.textContent(), /Edits stay off/);
    assert.equal(await granted(), null, 'nothing is granted before the confirmation');
    assert.equal(await edits.isChecked(), false, 'edits are not preselected on a broad folder');
    assert.equal(await edits.isDisabled(), true, 'edits are not selectable on a broad folder');
    assert.equal(await shell.count(), 0, 'shell tests are not offered (broad folder or not)');
    assert.equal(await button('Grant read-only access').isDisabled(), true);
    await warning.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${out}/mac-${theme}-broad-home.png` });
    await warning.getByRole('checkbox', { name: /I understand/ }).check();
    assert.equal(await button('Grant read-only access').isEnabled(), true);
    await button('Grant read-only access').click();
    await p.waitForFunction(() => Boolean(window.fixtureComputer?.()));
    assert.deepEqual(await granted().then(g => [g.path, g.canWrite, g.canTest]), ['/Users/fixture', false, false]);
    const last = (await calls()).at(-1); assert.deepEqual({ ...last, agentId: 'x' }, { agentId: 'x', allowEdits: false, allowTests: false, confirmBroad: true });
    await reopen(); await grant.getByText('Read-only folder:', { exact: true }).waitFor(); assert.equal(await warning.count(), 0);
    assert.equal(await edits.isChecked(), false); await revoke();

    // ~/Documents: Cancel closes the warning and sends nothing; picking a normal folder instead replaces it.
    await reopen(); await pick('/Users/fixture/Documents'); await edits.check(); const before = (await calls()).length; await button('Choose folder').click();
    await warning.waitFor(); assert.match(await warning.textContent(), /This folder holds a lot more than one project\./);
    await warning.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${out}/mac-${theme}-broad-documents.png` });
    await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await warning.count(), 0); assert.equal(await granted(), null); assert.equal((await calls()).length, before + 1, 'cancel sends nothing');
    assert.equal(await edits.isEnabled(), true);
    await button('Choose folder').click(); await warning.waitFor(); await pick('/fixture/project'); await button('Choose folder').click();
    await p.waitForFunction(() => Boolean(window.fixtureComputer?.())); assert.equal((await granted()).path, '/fixture/project');
    await revoke();

    // A disk root is worded for what it is.
    await reopen(); await pick('/'); await button('Choose folder').click(); await warning.waitFor();
    assert.match(await warning.textContent(), /This is the top level of a disk\./); assert.equal(await granted(), null);
    await p.setViewportSize({ width: 700, height: 600 }); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await warning.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${out}/mac-${theme}-broad-root-compact.png` });
    assert.deepEqual(errors, []); await p.close();
  }
}
