import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// The Projects page is one card of folders, each saying how much is open inside
// it. Tapping a folder enters the project; its terminals are read in the rail
// there, never on this page. This pins that the page names the counts without
// drawing a terminal, that a row hands its project to the app, that search
// reaches inside a folder, and that a watched Desktop lists the same folders.
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
    const opened = () => page.evaluate(() => window.opened);
    await page.goto(`${url}/?theme=${theme}`);
    // Each row says how many terminals the folder holds and how many run; none is drawn.
    await button('Studio, 3 terminals, 1 running').waitFor();
    await button('Orbit, 1 terminal, 1 running').waitFor();
    assert.equal(await page.getByText('localhost:5173').count(), 0, 'no terminal output is drawn on the page');
    assert.equal(await page.getByText('Development server').count(), 0, 'no terminal is listed on the page');
    assert.equal(await page.getByRole('button', { name: /^New chat in / }).count(), 0, 'the actions live in the project, not on the page');
    // A Host without the wizard keeps the row and asks to be updated, rather than hiding it.
    assert.equal(await button('New project').getAttribute('aria-disabled'), 'true', 'a Host without the wizard cannot open it');
    await capture(page, `${out}/projects-${theme}.png`);
    // A folder enters its project: no sheet opens, the app is handed the project.
    await button('Studio, 3 terminals, 1 running').click();
    assert.equal(await opened(), 'demo-studio', 'a row enters its project');
    assert.equal(await page.getByRole('dialog').count(), 0, 'no sheet stands between the row and the project');
    await button('Orbit, 1 terminal, 1 running').click();
    assert.equal(await opened(), 'demo-orbit', 'each row names its own project');

    // Enough folders raise the search, which reaches terminals inside a folder.
    await page.goto(`${url}/?theme=${theme}&many=1`);
    await button('Harbor, 4 terminals').waitFor();
    await button('Atlas, no terminals').waitFor();
    await capture(page, `${out}/projects-many-${theme}.png`);
    const search = page.getByRole('textbox', { name: 'Search projects and terminals' });
    await search.fill('shortcuts');
    await button('Orbit, 1 terminal, 1 running').waitFor();
    assert.equal(await page.getByRole('button', { name: /^Studio, / }).count(), 0, 'search hides the folders that match nothing');
    await capture(page, `${out}/projects-search-${theme}.png`);
    await search.fill('nothing here');
    await page.getByRole('heading', { name: 'No matches' }).waitFor();
    await search.fill('');
    await button('Atlas, no terminals').click();
    assert.equal(await opened(), 'demo-atlas', 'an empty folder is still a project to enter');

    // A Host that can build a project puts the New project row first; it opens the sheet.
    await page.goto(`${url}/?theme=${theme}&scaffold=1`);
    await button('New project').waitFor();
    await button('New project').click();
    assert.equal(await opened(), 'new', 'the row opens the New project sheet');
    await capture(page, `${out}/projects-new-${theme}.png`);
    // A paired Vibyra Desktop lists the same folders; what it refuses is withheld in the rail.
    await page.goto(`${url}/?theme=${theme}&watching=1&scaffold=1`);
    await page.getByText('The projects open in Vibyra on Studio Mac.').waitFor();
    // Starting a project is the one thing it does offer: the folder is new.
    assert.notEqual(await button('New project').getAttribute('aria-disabled'), 'true',
      'a watched Desktop that can scaffold offers it');
    await button('Studio, 3 terminals, 1 running').click();
    assert.equal(await opened(), 'demo-studio', 'a watched project is entered the same way');
    await capture(page, `${out}/projects-watching-${theme}.png`);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: folders count their terminals, a row enters its project, search reaches inside.`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} finally {
  await browser?.close();
  close();
}
