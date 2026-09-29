import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const out = '../output/workspace-tree';
await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/workspaceTreeFixture.tsx');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390,844], [320,568], [844,390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; const dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.goto(`${fixture.url}/?theme=${theme}`);
    const project = page.getByRole('button', { name: 'Studio', exact: true });
    await project.click();
    assert.equal(await page.getByTestId('selected-session').textContent(), 'demo-terminal',
      'opening a project selects its current terminal instead of showing Jump back in');
    assert.equal(await page.getByRole('button', { name: 'Hide sessions in Studio' }).getAttribute('aria-expanded'), 'true');
    const terminal = page.getByRole('button', { name: 'Development server, Terminal, Working', exact: true });
    await terminal.waitFor();
    await page.screenshot({ path: `${out}/phone-${theme}-${width}.png` });
    await page.getByRole('button', { name: 'Hide sessions in Studio' }).click();
    assert.equal(await terminal.count(), 0);
    const expand = page.getByRole('button', { name: 'Show sessions in Studio' });
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    await expand.click(); await terminal.click();
    assert.equal(await terminal.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByTestId('focused-session').textContent(), 'demo-terminal',
      'tapping the terminal row carries its exact identity into navigation');
    assert.equal(await page.getByRole('button', { name: 'Chats', exact: true }).count(), 0,
      'the standalone Chats branch is absent');
    assert.equal(await page.getByRole('button', { name: 'Project options for Studio' }).count(), 0);
    await project.click({ delay: 650 });
    await page.getByRole('button', { name: 'Remove this project from Vibyra' }).waitFor();
    const optionsHeight = (await page.getByTestId('overlay-sheet').boundingBox()).height;
    assert.ok(optionsHeight < height * 0.65 || height < 500, 'project options use a compact phone sheet');
    const rename = page.getByRole('button', { name: 'Rename project' });
    if (await rename.isEnabled()) {
      await rename.click();
      await page.getByRole('textbox', { name: 'Project name' }).waitFor();
      await page.getByRole('button', { name: 'Back' }).click();
    }
    await page.getByRole('button', { name: 'Remove this project from Vibyra' }).waitFor();
    await page.getByRole('button', { name: 'Close Project options' }).click();
    assert.equal(await page.getByText('Ideas', { exact: true }).count(), 0);
    const report = page.getByRole('button', { name: 'Report a problem' });
    const settings = page.getByRole('button', { name: 'Settings' });
    assert.equal(await report.count(), 0, 'report lives in Settings');
    const settingsBox = await settings.boundingBox();
    assert.equal(settingsBox.width, settingsBox.height, 'settings is a circle');
    assert.equal(settingsBox.width, 48);
    assert.equal(await page.getByTestId('navigation-drawer').evaluate(el => el.scrollWidth > el.clientWidth), false);
    if (width === 390) {
      const swipe = page.getByTestId('swipe-terminal-demo-terminal');
      const before = await swipe.boundingBox();
      await page.mouse.move(before.x + before.width - 30, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width - 120, before.y + before.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(220);
      const after = await swipe.boundingBox();
      assert.ok(after.x < before.x - 55, 'a left swipe reveals the terminal Delete action');
      await page.screenshot({ path: `${out}/swipe-delete-${theme}.png` });
      await page.getByRole('button', { name: 'Delete terminal Development server' }).click();
      await terminal.waitFor({ state: 'detached' });
      assert.deepEqual(dialogs, [], 'deleting the terminal needs no system confirmation');
      const finished = page.getByTestId('swipe-terminal-demo-empty');
      const finishedRow = await finished.boundingBox();
      await page.mouse.move(finishedRow.x + finishedRow.width - 20, finishedRow.y + finishedRow.height / 2);
      await page.mouse.down();
      await page.mouse.move(finishedRow.x + finishedRow.width - 190, finishedRow.y + finishedRow.height / 2, { steps: 12 });
      await page.mouse.up();
      await finished.waitFor({ state: 'detached' });
      assert.deepEqual(dialogs, [], 'a finished terminal can also be deleted directly');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${fixture.url}/?failDelete=1`);
    await page.getByRole('button', { name: 'Show sessions in Studio' }).click();
    const swipe = page.getByTestId('swipe-terminal-demo-terminal');
    const row = await swipe.boundingBox();
    await page.mouse.move(row.x + row.width - 20, row.y + row.height / 2);
    await page.mouse.down();
    await page.mouse.move(row.x + row.width - 190, row.y + row.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.getByText('The Mac could not delete this terminal.').waitFor();
    assert.ok(await swipe.isVisible(), 'a failed deletion restores the terminal row');
    assert.ok(Math.abs((await swipe.boundingBox()).x - row.x) < 2, 'a failed deletion resets the swipe position');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.goto(fixture.url);
    await page.getByRole('button', { name: 'Show sessions in Studio' }).click();
    const swipe = page.getByTestId('swipe-terminal-demo-terminal');
    const row = await swipe.boundingBox();
    await page.mouse.move(row.x + row.width - 20, row.y + row.height / 2);
    await page.mouse.down();
    await page.mouse.move(row.x + row.width - 190, row.y + row.height / 2, { steps: 12 });
    await page.mouse.up();
    await swipe.waitFor({ state: 'detached' });
    assert.deepEqual(dialogs, [], 'a full swipe deletes without a system confirmation');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${fixture.url}/?drop=1`);
    await page.getByRole('button', { name: 'Show sessions in Studio' }).click();
    await page.getByRole('button', { name: 'Development server, Terminal, Working' }).click();
    assert.equal(await page.getByTestId('selected-session').textContent(), '',
      'the fixture simulates a lost workspace selection');
    assert.equal(await page.getByTestId('focused-session').textContent(), 'demo-terminal',
      'the tapped terminal stays focused when the workspace selection is cleared');
    await page.close();
  }
  for (const [width, height] of [[390,844], [320,568], [844,390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?many=1`);
    assert.equal(await page.getByRole('button', { name: 'Project 10', exact: true }).count(), 0);
    const next = page.getByRole('button', { name: 'Next projects page' });
    const previous = page.getByRole('button', { name: 'Previous projects page' });
    assert.equal(await previous.getAttribute('aria-disabled'), 'true');
    await next.click();
    await page.getByRole('button', { name: 'Studio', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Studio', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: /^Project \d+$/ }).count() > 0);
    await page.screenshot({ path: `${out}/many-${width}.png` });
    for (let step = 0; step < 4 && await next.getAttribute('aria-disabled') !== 'true'; step++) await next.click();
    await page.getByRole('button', { name: 'Project 10', exact: true }).waitFor();
    assert.equal(await next.getAttribute('aria-disabled'), 'true');
    await previous.click();
    await page.getByRole('button', { name: 'Project 10', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Project 10', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS workspace tree: exact terminal focus, compact options, swipe delete without confirmation, disclosure, paging, both themes and compact layouts.');
} finally { await browser.close(); fixture.close(); }
