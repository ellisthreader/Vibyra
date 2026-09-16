import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture, until } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// Starting a project from the phone walks the desktop's questions: what are you
// making, which stack, how should it be set up, name it and place it, then the
// review of the literal commands, then the build. This pins the entry row on the
// Projects page, every step in both themes, the whole-catalog browser naming a
// missing toolchain, the skip path landing straight on naming, and a finished
// build handing the app the new project with the terminal option it left on.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-new-project'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/newProjectFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
    // Stacks are a multiple choice now, so each row is a checkbox.
    const stack = name => page.getByRole('checkbox', { name, exact: true });
    const heading = name => page.getByRole('heading', { name, exact: true });
    await page.goto(`${url}/?theme=${theme}`);
    // The entry sits in the list of projects, first, shaped like a folder row.
    await button('New project').waitFor();
    await capture(page, `${out}/new-project-row-${theme}.png`);
    await button('New project').click();
    await heading('What are you making?').waitFor();
    await button('Website').waitFor(); await button('Empty project').waitFor();
    await capture(page, `${out}/new-project-kind-${theme}.png`);
    // All nine kinds at once, on one screen. The step is a glance and a tap; the
    // moment it scrolls, the question has turned into a list to work through.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('*')].filter(el =>
      el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 200
      && getComputedStyle(el).overflowY !== 'visible').length), 0,
      'the kind step fits without scrolling');
    // The stack question: rows filed under the kind, the safe default first.
    await button('Website').click();
    await heading('Which stack?').waitFor();
    await stack('Next.js').waitFor(); await stack('Plain HTML, CSS and JavaScript').waitFor();
    // The first row was always the safe default for the kind; now it says so.
    await page.getByText('Recommended', { exact: true }).first().waitFor();
    // Nothing chosen yet, so there is nowhere to continue to.
    assert.equal(await button('Continue').isDisabled(), true, 'a stack has to be picked first');
    await capture(page, `${out}/new-project-stack-${theme}.png`);
    // Other… opens every stack; a missing toolchain is named, and the row cannot be tapped.
    await button('Other stacks').click();
    await page.getByRole('textbox', { name: 'Search every stack' }).fill('flutter');
    await stack('Flutter').waitFor();
    await page.getByText('Needs flutter', { exact: true }).waitFor();
    assert.equal(await stack('Flutter').isDisabled(), true, 'a stack whose tool is missing is not offered');
    await capture(page, `${out}/new-project-browse-${theme}.png`);
    await button('Back to website stacks').click();
    await stack('Next.js').click();
    // Picking one keeps the list up, so a second can be added to it.
    await heading('Which stack?').waitFor();
    await stack('Express').click();
    assert.equal(await stack('Next.js').isChecked(), true, 'the stack that makes the project stays on');
    assert.equal(await stack('Express').isChecked(), true, 'and the one added inside it is on too');
    // Two stacks cannot both make the folder, so choosing another takes its place.
    await stack('Astro').click();
    assert.equal(await stack('Next.js').isChecked(), false, 'only one stack can make the folder');
    assert.equal(await stack('Express').isChecked(), true, 'what was added inside it survives the swap');
    await stack('Next.js').click();
    await capture(page, `${out}/new-project-stack-combined-${theme}.png`);
    await button('Continue').click();
    // Naming comes next, and it is the whole screen: one large field, the path
    // under it, and the stacks just chosen shown above.
    await heading('Name your project').waitFor();
    const name = page.getByRole('textbox', { name: 'Project name' });
    assert.equal(await name.inputValue(), 'untitled');
    await name.fill('My Site');
    await page.getByText('~/Projects/', { exact: false }).first().waitFor();
    await capture(page, `${out}/new-project-where-${theme}.png`);
    await name.fill('!!!');
    await page.getByText('Use letters or numbers in the name.', { exact: true }).waitFor();
    assert.equal(await button('Continue').isDisabled(), true, 'a name that makes no folder cannot continue');
    await name.fill('My Site');
    await button('Continue').click();
    // Setting up is the last question, and its own button starts the build:
    // there is no page after it repeating what it already says.
    await heading('How should it be set up?').waitFor();
    for (const label of ['Install dependencies', 'Start a git repository', 'Open a terminal when it is done']) {
      await page.getByRole('switch', { name: label }).waitFor();
    }
    // The commands are folded away here rather than given a screen of their own.
    await button('Show the commands').click();
    await page.getByText(/^npx --yes create-next-app@latest my-site/).waitFor();
    await page.getByText('npm install', { exact: true }).waitFor();
    await capture(page, `${out}/new-project-options-${theme}.png`);
    // The build reports each step; the sheet then hands the app the shared project.
    await button('Start building on Studio Mac').click();
    await heading('Building your project').waitFor();
    await page.getByText('Creating the Next.js app', { exact: true }).first().waitFor();
    // Every step of the plan is listed from the start, not just the one running.
    await page.getByText('Installing packages', { exact: true }).first().waitFor();
    await page.getByText(/^of \d+$/).waitFor();
    await button('Cancel').waitFor();
    await capture(page, `${out}/new-project-running-${theme}.png`);
    await page.getByRole('button', { name: /^Show output/ }).click();
    await page.getByText(/create-next-app@latest my-site/).first().waitFor();
    await until(() => page.evaluate(() => window.done), 'the build finishes');
    assert.deepEqual(await page.evaluate(() => window.done), ['demo-my-site', 'my-site', true], 'the project is handed over with the terminal option');
    await button('my-site, no terminals').waitFor();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await capture(page, `${out}/new-project-done-${theme}.png`);
    // Skipping the first question goes straight to naming, and sets up as an empty folder.
    await button('New project').click();
    await heading('What are you making?').waitFor();
    await button('Skip — just make a folder').click();
    await heading('Name your project').waitFor();
    await button('Continue').click();
    await heading('How should it be set up?').waitFor();
    await page.getByText(/Nothing is run — the folder is created and left empty for you\./).waitFor();
    await capture(page, `${out}/new-project-empty-setup-${theme}.png`);
    // Back retraces the questions; close leaves the page as it was.
    await button('Back').click();
    await heading('Name your project').waitFor();
    await button('Close New project').click();
    await button('New project').waitFor();
    // Without the wizard on the computer, or on a watched Desktop, the row stays and
    // names the computer to ask. It used to vanish, which read as a feature nobody wrote.
    const blockedRow = async (reason, why) => {
      const row = button('New project');
      assert.equal(await row.count(), 1, why);
      assert.equal(await row.getAttribute('aria-disabled'), 'true', `${why} — and it cannot be opened`);
      await page.getByText(reason).waitFor();
    };
    await page.goto(`${url}/?theme=${theme}&unavailable=1`);
    await button('Studio, 3 terminals, 1 running').waitFor();
    await blockedRow(/Update Vibyra on .+ to start projects from your phone\./,
      'an older Host keeps the row and asks to be updated');
    await capture(page, `${out}/new-project-unavailable-${theme}.png`);
    // A watched Desktop refuses every other change and still builds a project.
    await page.goto(`${url}/?theme=${theme}&watching=1`);
    await button('Studio, 3 terminals, 1 running').waitFor();
    assert.notEqual(await button('New project').getAttribute('aria-disabled'), 'true',
      'a watched Desktop can still start a project');
    await button('New project').click();
    await heading('What are you making?').waitFor();
    await capture(page, `${out}/new-project-watching-${theme}.png`);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: the questions, the review, the build and the skip path all reach a project.`);
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} finally {
  await browser?.close();
  close();
}
