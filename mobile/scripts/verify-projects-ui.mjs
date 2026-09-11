import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// A project on this page is a folder you open: it drops down to the terminals
// inside it, and one of those opens that session. This pins the drop-down, the
// accordion, the search that reaches terminals in closed projects, and the two
// actions that used to be the only thing a project row could do.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-projects'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/projectsFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const background = target => target.evaluate(node => getComputedStyle(node).backgroundColor);
    await page.goto(`${url}/?theme=${theme}`);
    await button('Studio').waitFor();
    // Closed is closed: the terminals inside a project are not on the page yet.
    assert.equal(await page.getByRole('button', { name: /^Development server/ }).count(), 0,
      'A closed project keeps its terminals put away');
    assert.equal(await page.getByRole('button', { name: /^New chat in / }).count(), 0,
      'A closed project shows no actions either');
    await capture(page, `${out}/projects-${theme}.png`);
    await button('Studio').click();
    assert.equal(await button('Studio').getAttribute('aria-expanded'), 'true', 'Tapping a project opens it');
    for (const terminal of ['Development server, Terminal, Running', 'A calmer checkout, Claude, Exited',
      'Polish the empty states, Claude, Exited']) await button(terminal).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Add keyboard shortcuts/ }).count(), 0,
      'A project lists its own terminals only');
    await button('New chat in Studio').waitFor();
    await button('Open Studio files').waitFor();
    await capture(page, `${out}/projects-open-${theme}.png`);
    // One folder at a time, so the page stays as short as the list of projects.
    await button('Orbit').click();
    await button('Add keyboard shortcuts, Codex, Running').waitFor();
    assert.equal(await button('Studio').getAttribute('aria-expanded'), 'false', 'Opening a project closes the last one');
    // A terminal here opens that session, the way it does from the rail.
    await button('Add keyboard shortcuts, Codex, Running').click();
    assert.equal(await page.evaluate(() => window.opened), 'demo-shortcuts', 'A terminal opens its session');
    assert.notEqual(await background(page.getByRole('button', { name: /^Add keyboard shortcuts/ })),
      await background(button('Orbit')), 'The open session is marked in the list');
    await capture(page, `${out}/projects-selected-${theme}.png`);
    await button('Orbit').click();
    assert.equal(await page.getByRole('button', { name: /^Add keyboard shortcuts/ }).count(), 0, 'Tapping again closes it');
    // Search reaches terminals inside closed projects, and opens what it found.
    await page.goto(`${url}/?theme=${theme}&many=1`);
    const search = page.getByRole('textbox', { name: 'Search projects and terminals' });
    await search.fill('shortcuts');
    await button('Add keyboard shortcuts, Codex, Running').waitFor();
    assert.equal(await button('Studio').count(), 0, 'Search hides the projects that match nothing');
    assert.equal(await page.getByRole('button', { name: /^Development server/ }).count(), 0,
      'A matched project lists the terminals that matched');
    await capture(page, `${out}/projects-search-${theme}.png`);
    await search.fill('atlas');
    await button('Atlas').waitFor();
    await page.getByText('No terminals open yet.', { exact: true }).waitFor();
    await search.fill('nothing here');
    await page.getByRole('heading', { name: 'No matches' }).waitFor();
    // A paired Vibyra Desktop lists the same folders and refuses every request
    // that changes them, so this page must watch rather than offer work.
    await page.goto(`${url}/?theme=${theme}&watching=1`);
    await button('Studio').click();
    await button('Development server, Terminal, Running').waitFor();
    assert.equal(await page.getByRole('button', { name: /^New chat in / }).count(), 0,
      'A computer this phone is only watching offers no new terminal');
    assert.equal(await page.getByRole('button', { name: /^Open Studio files/ }).count(), 0,
      'and no files it would refuse to read');
    await page.getByText('The projects open in Vibyra on your computer. Tap a terminal to watch it.').waitFor();
    await capture(page, `${out}/projects-watching-${theme}.png`);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: projects open in place, list their terminals, open a session, and search reaches inside.`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} finally {
  await browser?.close();
  close();
}
