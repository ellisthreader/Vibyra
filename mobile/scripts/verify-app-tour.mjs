import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

// The live walkthrough on the real WorkspaceApp: it lights the real menu button,
// Code/Agents switch and start options, then opens the production New terminal
// UI in safe preview mode, compares funding sources, then opens real connection setup.
// SHOTS=<dir> saves each stage.
const shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const { url, close } = await serveFixture('tests/appTourBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const errors = [];
  const open = async (query = '', viewport = { width: 390, height: 844 }) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: shots ? 3 : 1 });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/?${query}`);
    return page;
  };
  const card = (page, title) => page.getByText(title, { exact: true });
  const step = (page, n, total) => page.getByRole('progressbar', { name: `Step ${n} of ${total}` });
  // Through the real welcome flow: Create account, the signed-in page, then Skip on the computer choice.
  const arrive = async page => {
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip — I’ll decide later' }).click();
  };
  const shoot = async (page, name) => {
    if (!shots) return;
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${shots}/${name}.png` });
  };
  const replay = async (page, settingsPage) => {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByText(settingsPage, { exact: true }).first().click();
    await page.getByText('Show walkthrough', { exact: true }).click();
    await card(page, 'Everything starts here').waitFor({ timeout: 5000 });
    await step(page, 1, 6).waitFor();
    await page.getByRole('button', { name: 'Skip walkthrough' }).click();
    await card(page, 'Everything starts here').waitFor({ state: 'detached', timeout: 3000 });
  };

  // A new account: the walkthrough lights each real control in turn.
  const page = await open();
  await arrive(page);
  await card(page, 'Everything starts here').waitFor({ timeout: 5000 });
  await step(page, 1, 6).waitFor();
  await shoot(page, 'dark-1-menu');
  await page.getByRole('button', { name: 'Next' }).click();
  await card(page, 'Everything starts here').waitFor({ state: 'detached', timeout: 600 });
  await card(page, 'Two ways to work').waitFor({ timeout: 3000 });
  await step(page, 2, 6).waitFor();
  await shoot(page, 'dark-2-mode');
  await page.getByRole('button', { name: 'Back' }).click();
  await card(page, 'Everything starts here').waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Pair Vibyra Desktop to see', { exact: false }).waitFor({ timeout: 3000 });
  await step(page, 3, 6).waitFor();
  await shoot(page, 'dark-3-start');
  await page.getByRole('button', { name: 'Back' }).click();
  await card(page, 'Two ways to work').waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await card(page, 'Start a terminal in a tap').waitFor();
  await step(page, 4, 6).waitFor();
  await page.getByTestId('project-terminal-launcher').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal' }).isDisabled(), true);
  await page.getByRole('tab', { name: 'Your AI accounts' }).waitFor();
  await page.getByRole('radio', { name: 'Select Codex' }).waitFor();
  await shoot(page, 'dark-4-terminal');
  await page.getByRole('button', { name: 'More models' }).click();
  await page.getByRole('textbox', { name: 'Search AI models' }).waitFor();
  await page.getByRole('button', { name: 'Close model picker' }).click();
  await page.getByRole('radio', { name: 'Select Codex' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await step(page, 3, 6).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await card(page, 'Your AI, or ours').waitFor();
  await step(page, 5, 6).waitFor();
  await page.getByRole('heading', { name: 'All models' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal' }).count(), 0, 'model browsing does not launch');
  await shoot(page, 'dark-5-funding');
  await page.getByRole('tab', { name: 'Your AI accounts' }).click();
  await page.getByRole('heading', { name: 'All models' }).waitFor({ state: 'detached' });
  await page.getByRole('radio', { name: 'Select Codex' }).waitFor();
  await page.getByRole('tab', { name: 'Vibyra tokens' }).click();
  await page.getByRole('heading', { name: 'All models' }).waitFor();
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes('terminal-source:'))), false,
    'the walkthrough does not save a funding preference');
  await page.getByRole('button', { name: 'Back' }).click();
  await step(page, 4, 6).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await step(page, 5, 6).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await card(page, 'See it live').waitFor();
  await step(page, 6, 6).waitFor();
  await page.getByRole('button', { name: 'I’ve installed it' }).waitFor();
  await shoot(page, 'dark-6-connect');
  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await page.getByRole('button', { name: 'Back to setup' }).waitFor();
  await page.getByRole('button', { name: 'Back to setup' }).click();
  assert.equal(await page.getByRole('button', { name: 'Skip walkthrough' }).count(), 1, 'skip remains available on the last stage');
  await page.getByRole('button', { name: 'Back' }).click();
  await step(page, 5, 6).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();
  await card(page, 'See it live').waitFor({ state: 'detached', timeout: 3000 });
  // The flag is written just as the tour unmounts, so wait for it rather than reading it that instant.
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('tour-seen.')), null, { timeout: 3000 });

  // Seen once, it does not open again; it can be replayed from Help and Advanced.
  await page.reload();
  await arrive(page);
  await page.waitForTimeout(1500);
  assert.equal(await card(page, 'Everything starts here').count(), 0, 'a seen walkthrough stays closed');
  await replay(page, 'Help');
  await replay(page, 'Advanced');

  // Replaying from another destination returns to the real home before measuring.
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Connect a computer' }).click();
  await page.getByRole('heading', { name: 'Remote' }).waitFor();
  await replay(page, 'Help');
  await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();

  // Connecting a computer straight away: the walkthrough waits under the sheet and appears once it closes.
  const connecting = await open('theme=light', { width: 375, height: 667 });
  await arrive(connecting);
  await connecting.getByRole('button', { name: 'Connect your computer' }).click();
  await connecting.waitForTimeout(1600);
  assert.equal(await card(connecting, 'Everything starts here').count(), 0, 'never drawn over the connect sheet');
  await connecting.getByRole('button', { name: 'Close Connect your computer' }).click();
  await card(connecting, 'Everything starts here').waitFor({ timeout: 5000 });
  await shoot(connecting, 'light-small-1-menu');
  for (let step = 0; step < 3; step++) await connecting.getByRole('button', { name: 'Next' }).click();
  await step(connecting, 4, 6).waitFor();
  await shoot(connecting, 'light-small-4-terminal');
  await connecting.getByRole('button', { name: 'Next' }).click();
  await step(connecting, 5, 6).waitFor();
  await connecting.getByRole('heading', { name: 'All models' }).waitFor();
  await shoot(connecting, 'light-small-5-funding');
  await connecting.getByRole('button', { name: 'Next' }).click();
  await step(connecting, 6, 6).waitFor();
  await card(connecting, 'See it live').waitFor();
  await connecting.getByRole('button', { name: 'I’ve installed it' }).waitFor();
  await shoot(connecting, 'light-small-6-connect');
  await connecting.getByRole('button', { name: 'Skip walkthrough' }).click();
  await card(connecting, 'Everything starts here').waitFor({ state: 'detached', timeout: 3000 });

  // An account without Agents gets two home stops and the same three UI pages.
  const noAgents = await open('noAgents');
  await arrive(noAgents);
  await step(noAgents, 1, 5).waitFor({ timeout: 5000 });
  await noAgents.getByRole('button', { name: 'Next' }).click();
  await step(noAgents, 2, 5).waitFor();
  await noAgents.getByRole('button', { name: 'Back' }).click();
  await step(noAgents, 1, 5).waitFor();
  await noAgents.getByRole('button', { name: 'Next' }).click();
  await noAgents.getByRole('button', { name: 'Next' }).click();
  await step(noAgents, 3, 5).waitFor();
  await noAgents.getByRole('button', { name: 'Skip walkthrough' }).click();

  // A returning person who just updated the app never sees it open by itself.
  const returning = await open('returning');
  await returning.waitForTimeout(1800);
  assert.equal(await card(returning, 'Everything starts here').count(), 0, 'no walkthrough without the welcome flow');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('Walkthrough: fast boxes, six stages, production terminal UI, funding sources, connection, Back/Next/Skip and replay.');
} finally {
  await browser?.close();
  close();
}
