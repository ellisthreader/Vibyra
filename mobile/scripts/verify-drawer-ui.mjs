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
      const open = async () => {
        await button('Open navigation menu').click();
        await panel.waitFor();
        await page.waitForFunction(() => Math.abs(document.querySelector('[data-testid="navigation-drawer"]').getBoundingClientRect().x) < 1);
      };
      const shot = name => capture(page, `${out}/${size}-${colorScheme}-${name}.png`);
      await page.goto(`${url}/?demo=1`);
      await open();
      const bounds = await panel.boundingBox();
      assert.ok(bounds && bounds.y === 0 && bounds.height === height, 'The sidebar covers the entire screen height');
      assert.equal(await button('Open navigation menu').count(), 0, 'Background navigation is hidden from accessibility');
      await fullyVisible(button('Settings'), page, 'Pinned settings');
      // Chat and Settings are pinned to the rail, not the list, so they survive a scroll.
      await fullyVisible(button('New chat'), page, 'Pinned chat action');
      // One Recents list: no filter tabs, and a terminal sits in it beside the chats.
      assert.equal(await page.getByRole('tab').count(), 0, 'Recents carries no filter tabs');
      await button('Development server, Terminal').scrollIntoViewIfNeeded();
      await shot('recent');
      await openSearch();
      await search.fill('nothing-matches-this');
      await page.getByText('No results', { exact: true }).scrollIntoViewIfNeeded();
      await shot('search-empty');
      const closeBounds = await button('Close search').boundingBox();
      assert.ok(closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44, 'Close search has a 44pt touch target');
      await button('Close search').click();
      assert.equal(await search.count(), 0, 'Closing search returns the rail to its logo row');
      await openSearch();
      await search.fill('orbit');
      assert.equal(await button('A calmer checkout, Claude').count(), 0);
      await button('Add keyboard shortcuts, Codex').click();
      await open();
      assert.equal(await search.count(), 0, 'Reopening the rail returns it to its logo row');
      const selectedBackground = await background(button('Add keyboard shortcuts, Codex'));
      assert.notEqual(selectedBackground, await background(button('A calmer checkout, Claude')));
      await shot('selected');
      await button('Projects').click();
      await open();
      assert.notEqual(await background(button('Projects')), await background(button('Remote')));
      assert.notEqual(await background(button('Add keyboard shortcuts, Codex')), selectedBackground);
      await button('Remote').click();
      await open();
      assert.notEqual(await background(button('Remote')), await background(button('Projects')));
      await button('Settings').click();
      await open();
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
      // A phone with no computer has no computer sessions to list, so the rail drops
      // the Recent section entirely and offers the one way to add a computer instead.
      assert.equal(await page.getByRole('tab').count(), 0, 'No session filters anywhere');
      assert.equal(await button('Projects').count(), 0, 'No Projects without a computer');
      await button('Remote').scrollIntoViewIfNeeded();
      await shot('empty');
      await fullyVisible(button('Settings'), page, 'Settings in an empty workspace');
      await button('Settings').click();
      await button('Show welcome again').waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${colorScheme}: full-height rail, navigation, filters, search, selection, empty states and dismissal.`);
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
