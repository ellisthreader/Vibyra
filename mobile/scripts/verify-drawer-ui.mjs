import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-sidebar-screenshots';
const url = process.env.VIBYRA_URL ?? 'http://127.0.0.1:8081';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
});
let activePage;
try {
  for (const [size, width, height] of [['compact', 375, 667], ['iphone', 402, 874], ['landscape', 844, 390], ['wide', 1024, 900]]) {
    for (const colorScheme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme,
        reducedMotion: size === 'iphone' ? 'no-preference' : 'reduce' });
      activePage = page;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const button = name => page.getByRole('button', { name, exact: true });
      const background = target => target.evaluate(node => getComputedStyle(node).backgroundColor);
      const search = page.getByRole('textbox', { name: 'Search chats', exact: true });
      // Search is an icon beside the logo now, so the top of the rail stays one line.
      const openSearch = async () => { await button('Search chats').click(); await search.waitFor(); };
      const panel = page.getByTestId('navigation-drawer');
      // The rail has finished sliding in, whoever opened it.
      const settled = async () => {
        await panel.waitFor();
        await page.waitForFunction(() => Math.abs(document.querySelector('[data-testid="navigation-drawer"]').getBoundingClientRect().x) < 1);
      };
      const open = async () => { await button('Open navigation menu').click(); await settled(); };
      const shot = name => capture(page, `${out}/${size}-${colorScheme}-${name}.png`);
      await page.goto(`${url}/?demo=1`);
      await open();
      const bounds = await panel.boundingBox();
      assert.ok(bounds && bounds.y === 0 && bounds.height === height, 'The sidebar covers the entire screen height');
      assert.equal(await button('Open navigation menu').count(), 0, 'Background navigation is hidden from accessibility');
      await fullyVisible(button('Settings'), page, 'Pinned settings');
      // Chat and Settings are pinned to the rail, not the list, so they survive a scroll.
      await fullyVisible(button('New project'), page, 'Pinned project action');
      // The home face is the map of the app and its projects: Ideas first, then
      // the computer's folders, the places, and Ideas' chats. Terminals are not
      // drawn in it: a folder row swaps the rail to that folder's own face.
      assert.equal(await page.getByRole('tab').count(), 0, 'The rail carries no filter tabs');
      const project = name => page.getByRole('button', { name: new RegExp(`^${name}, `) });
      const terminal = button('Development server, Terminal, Working');
      await button('Remote').waitFor();
      await button('Integrations').waitFor();
      await page.getByRole('button', { name: /^Ideas, / }).waitFor();
      await project('Studio').waitFor();
      assert.equal(await terminal.count(), 0, 'The home face lists no terminal');
      assert.equal(await button('Back to chats').count() + await button('Back to projects').count(), 0, 'The home face has nothing to go back to');
      await shot('home');
      await openSearch();
      await search.fill('nothing-matches-this');
      // The projects answer for themselves; with the phone chat, its chats do too.
      await page.getByText(/No projects match|No chats match/).first().waitFor();
      await shot('search-empty');
      const closeBounds = await button('Close search').boundingBox();
      assert.ok(closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44, 'Close search has a 44pt touch target');
      await button('Close search').click();
      assert.equal(await search.count(), 0, 'Closing search returns the rail to its logo row');
      // Entering a project from the Projects page opens the rail at once on that
      // project's own face: its name at the top, its terminals under it, and none
      // of the places or chats that belong to the app as a whole.
      await project('Studio').click();
      await settled();
      const title = panel.getByRole('heading', { name: 'Studio', exact: true });
      await title.waitFor();
      await terminal.waitFor();
      await button('A calmer checkout, Claude, Finished').waitFor();
      assert.equal(await button('Add keyboard shortcuts, Codex, Working').count(), 0, 'Another project’s terminal is not listed');
      assert.equal(await button('Remote').count(), 0, 'The project face has no Remote');
      assert.equal(await button('Integrations').count(), 0, 'The project face has no Integrations');
      assert.equal(await button('Search chats').count(), 0, 'The project face has no search');
      // The list is only terminals; starting one is the pinned action at the foot.
      assert.equal(await button('Open Studio files').count(), 0, 'No files row in the rail');
      assert.equal(await page.getByText('Terminal', { exact: true }).count(), 1, 'Terminal is one pinned button, not a row');
      await fullyVisible(button('New chat in Studio'), page, 'Pinned terminal action in a project');
      await shot('project');
      // A terminal opens in place; the rail marks it, and reopening keeps the project face.
      await terminal.click();
      await page.getByRole('button', { name: 'Switch chat', exact: true }).waitFor();
      await open();
      await title.waitFor();
      assert.notEqual(await background(terminal), await background(button('A calmer checkout, Claude, Finished')));
      await shot('selected');
      // The back arrow leaves the project: the rail returns to the projects and stays open.
      await button('Back to projects').click();
      await button('Remote').waitFor();
      assert.equal(await title.count(), 0, 'Leaving the project takes its face with it');
      assert.equal(await terminal.count(), 0, 'Leaving the project takes its terminals with it');
      await button('Close navigation menu').click();
      // Leaving a folder lands in Ideas, the home.
      await page.getByRole('textbox', { name: 'Prompt for new chat', exact: true }).waitFor();
      // Opening a terminal from anywhere puts the rail in its project's face.
      await open();
      await project('Orbit').click();
      await settled();
      await panel.getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
      await button('Add keyboard shortcuts, Codex, Working').click();
      await open();
      await panel.getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
      await button('Back to projects').click();
      // Home again: Ideas is the current project, so its row is the one filled.
      assert.notEqual(await background(page.getByRole('button', { name: /^Ideas, / })), await background(button('Remote')));
      await button('Remote').click();
      await open();
      assert.notEqual(await background(button('Remote')), await background(button('Integrations')));
      // Settings is a sheet over the screen, not a page: the rail closes and the sheet rises.
      await button('Settings').click();
      const settings = page.getByRole('dialog', { name: 'Settings' });
      await settings.waitFor();
      await button('Close Settings').click();
      await settings.waitFor({ state: 'detached' });
      // Remote is still the page; the Ideas row takes the screen home, and the rail steps aside.
      await open();
      await page.getByRole('button', { name: /^Ideas, / }).click();
      await page.getByRole('textbox', { name: 'Prompt for new chat', exact: true }).waitFor();
      await button('New chat').click();
      await page.getByRole('textbox', { name: 'Prompt for new chat', exact: true }).waitFor();
      await open();
      await button('Close navigation menu').click();
      await button('Open navigation menu').waitFor();
      await open();
      await page.mouse.click(width - 10, Math.floor(height / 2));
      await button('Open navigation menu').waitFor();
      await page.goto(url);
      await button('Get started').click();
      await button('Skip for now').click();
      await button('Skip — I’ll decide later').click();
      await open();
      // A phone that has never paired a computer still has its projects: Ideas,
      // and nothing else. Remote is the one way to add a computer.
      assert.equal(await page.getByRole('tab').count(), 0, 'No session filters anywhere');
      await page.getByRole('button', { name: /^Ideas, / }).waitFor();
      assert.equal(await project('Studio').count(), 0, 'No folders without a computer');
      assert.equal(await button('Back to projects').count(), 0, 'No project face without a computer');
      await button('Remote').scrollIntoViewIfNeeded();
      await shot('empty');
      await fullyVisible(button('Settings'), page, 'Settings in an empty workspace');
      await button('Settings').click();
      await button('Advanced').click();
      await button('Show welcome again').waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${colorScheme}: full-height rail, home and project faces, navigation, search, selection, empty states and dismissal.`);
    }
  }
  console.log(`Screenshots: ${out}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    console.error(await activePage.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); }
