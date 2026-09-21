// Vibyra has one home, Ideas, and a computer is something a project gains rather
// than something the app demands. This walks a real browser through both states
// and asserts the phone-only home offers nothing that needs a computer, that no
// text box asks for one, and that connecting a computer adds its folders and
// terminals to the rail without swapping the screen.
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
    const ideas = page.getByRole('button', { name: /^Ideas, / });
    const studio = page.getByRole('button', { name: /^Studio, / });
    const prompt = page.getByRole('textbox', { name: 'Prompt for new chat' });
    const shot = name => capture(page, `${out}/${size}-${name}.png`);
    const drawer = async () => { await button('Open navigation menu').click(); await page.getByTestId('navigation-drawer').waitFor(); };
    const closeDrawer = () => button('Close navigation menu').click();
    const menu = async name => { await drawer(); await button(name).click(); };

    await page.goto(url);
    await button('Get started').waitFor();
    await button('I already have an account').click();
    await button('Skip for now').click();
    await button('Skip — I’ll decide later').click();

    // Phone only. The app opens in Ideas, ready to type into, and nothing on it
    // needs, mentions or leads to a computer.
    await prompt.waitFor();
    assert.equal(await button('Open terminal').count(), 0, 'A phone with no computer offers no terminal');
    assert.equal(await button('Browse projects').count(), 0, 'A phone with no computer offers no projects button');
    assert.equal(await button('Connect computer').count(), 0, 'The chat carries no connect card');
    assert.equal(await page.getByText(/Connect your computer/).count(), 0, 'The chat never asks for a computer');
    assert.equal(await page.getByText('Computer offline', { exact: true }).count(), 0, 'No connection status without a computer');
    await shot('phone-home');
    // The rail is the app: Ideas, the two places, its chats, and + Project at the foot.
    await drawer();
    await ideas.waitFor();
    await button('Remote').waitFor();
    await button('Integrations').waitFor();
    await button('New project').waitFor();
    assert.equal(await studio.count(), 0, 'A phone with no computer lists no folders');
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

    // Connected. The sample workspace reports a connected computer. The screen
    // is the same; the rail gains the computer's folders under its name.
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
    await prompt.waitFor();
    await drawer();
    await ideas.waitFor();
    await page.getByTestId('navigation-drawer').getByText('Sample workspace', { exact: true }).waitFor();
    for (const project of ['Studio', 'Orbit']) await page.getByRole('button', { name: new RegExp(`^${project}, `) }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 0, 'The rail carries no filter tabs');
    assert.equal(await button('Development server, Terminal, Working').count(), 0, 'The home face lists no terminal');
    await shot('computer-rail');
    // Entering a folder swaps the rail to that folder's face: its chats and terminals.
    await studio.click();
    await button('Development server, Terminal, Working').waitFor();
    await button('New chat in Studio').waitFor();
    await button('Options for Studio').waitFor();
    assert.equal(await button('Remote').count(), 0, 'The folder face has no places');
    await shot('computer-project-rail');
    await closeDrawer();
    await button('Open terminal').waitFor();
    await page.getByText('Working in Studio.', { exact: true }).waitFor();
    await shot('computer-project');
    // Back returns the rail home and the screen to Ideas.
    await drawer();
    await button('Back to projects').click();
    await ideas.waitFor();
    await closeDrawer();
    await prompt.waitFor();
    assert.equal(await page.getByText('Working in Studio.', { exact: true }).count(), 0, 'Ideas is not a folder');

    // Leaving the computer takes its folders and terminals with it; Ideas stays.
    await menu('Settings');
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
    await prompt.waitFor();
    assert.equal(await button('Open terminal').count(), 0, 'Losing the computer takes its terminals with it');
    await drawer();
    await ideas.waitFor();
    assert.equal(await studio.count(), 0, 'Losing the computer takes its folders with it');
    assert.equal(await button('Development server, Terminal, Working').count(), 0, 'Losing the computer takes its terminals with it');
    await closeDrawer();

    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${size}: Ideas is home with or without a computer; the chat never asks for one; a computer adds folders and terminals to the rail.`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    console.error('Visible state:', await activePage.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); }
