// Vibyra has two modes and only the computer connection chooses between them.
// This walks a real browser through both and asserts the phone-only mode offers
// nothing that needs a computer, and the connected mode offers all of it.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-mode-screenshots';
const url = process.env.VIBYRA_URL ?? 'http://127.0.0.1:8081';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let activePage;
try {
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    activePage = page;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const shot = name => capture(page, `${out}/${size}-${name}.png`);
    const drawer = async () => { await button('Open navigation menu').click(); await page.getByTestId('navigation-drawer').waitFor(); };
    const closeDrawer = () => button('Close navigation menu').click();
    const menu = async name => { await drawer(); await button(name).click(); };

    await page.goto(url);
    await button('Get started').waitFor();
    await button('I already have an account').click();
    await button('Skip for now').click();
    await button('Skip — I’ll decide later').click();
    await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();

    // Phone only. Nothing on this screen needs, mentions or leads to a computer,
    // beyond the single deliberate way to add one.
    assert.equal(await button('Open terminal').count(), 0, 'A phone with no computer offers no terminal');
    assert.equal(await button('Browse projects').count(), 0, 'A phone with no computer offers no projects');
    assert.equal(await page.getByText('Computer offline', { exact: true }).count(), 0, 'No connection status without a computer');
    await shot('phone-home');
    await drawer();
    assert.equal(await button('Projects').count(), 0, 'The rail hides Projects without a computer');
    // Remote is the one computer entry a phone-only user gets: it is the install flow.
    await button('Remote').waitFor();
    assert.equal(await button('Development server, Terminal, Working').count(), 0, 'No terminals in the rail without a computer');

    await shot('phone-rail');
    await closeDrawer();
    await menu('Settings');
    await page.getByRole('dialog', { name: 'Settings' }).waitFor();
    // Without a computer the sheet's one computer row is the way to add one.
    await button('Connect a computer').waitFor();
    assert.equal(await button('Smaller terminal text').count(), 0, 'Terminal settings stay hidden without a computer');
    assert.equal(await button('Forget saved connection').count(), 0, 'Nothing is saved to forget');

    await shot('phone-settings');

    // Connected. The sample workspace reports a connected computer, so it is this
    // mode: every shared project, the Terminals section and a visible online state.
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Open terminal', exact: true }).waitFor();
    await button('Browse projects').waitFor();
    await page.getByText('Sample workspace', { exact: true }).first().waitFor();
    await shot('computer-home');
    await drawer();
    await button('Projects').waitFor();
    await button('Remote').waitFor();
    // The rail carries no filter tabs and no terminals: those wait in their project's face.
    assert.equal(await page.getByRole('tab').count(), 0, 'The rail carries no filter tabs');
    assert.equal(await button('Development server, Terminal, Working').count(), 0, 'The home face lists no terminal');
    await shot('computer-rail');
    await closeDrawer();
    await menu('Projects');
    for (const project of ['Studio', 'Orbit']) await page.getByText(project, { exact: true }).first().waitFor();
    await shot('computer-projects');
    // Entering a project opens the rail at once on that project's terminals.
    await page.getByRole('button', { name: /^Studio, / }).click();
    await page.getByTestId('navigation-drawer').waitFor();
    await button('Development server, Terminal, Working').waitFor();
    await button('Back to chats').click();
    await closeDrawer();

    // Leaving the computer puts the phone straight back into its own mode.
    await menu('Settings');
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
    await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
    assert.equal(await button('Open terminal').count(), 0, 'Losing the computer takes its terminals with it');
    await drawer();
    assert.equal(await button('Development server, Terminal, Working').count(), 0, 'Losing the computer takes its terminals with it');
    // Nothing was ever paired here, so there is nothing to remember: a computer
    // that has answered once keeps its Projects row when it goes away.
    assert.equal(await button('Projects').count(), 0, 'A phone that never paired one is offered no projects');
    await closeDrawer();

    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${size}: phone-only mode hides every computer surface; connecting one restores projects, terminals and status.`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    console.error('Visible state:', await activePage.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); }
