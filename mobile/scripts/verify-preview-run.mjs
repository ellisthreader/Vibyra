import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

// Run a project's desktop app from the phone: explicit approval of the exact
// command, progress, one automatic window open per run, and no Run UI on old computers.
const { url, close } = await serveFixture('tests/previewRunFixture.tsx');
const browser = process.env.VIBYRA_TEST_WEBKIT ? await webkit.launch() : await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const events = page => page.evaluate(() => JSON.parse(JSON.stringify(window.run.events)));
const grant = letter => letter.repeat(32);
const windowTarget = (letter, projectId = 'one') => ({ grantId: grant(letter), projectId,
  targetId: `native-window:4${letter.charCodeAt(0)}:7:view`, name: 'HKE', running: true, kind: 'window' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);

  // The card offers the idle app; the sheet shows the exact command, its script and folder.
  await page.getByRole('button', { name: 'Live preview. Run HKE', exact: true }).click();
  await page.getByText('Run this project’s app').waitFor();
  await page.getByText('npm run rust:dev', { exact: true }).waitFor();
  await page.getByText('tauri dev --config app.json', { exact: true }).waitFor();
  await page.getByText('Runs on your computer, outside the agent sandbox.').waitFor();
  assert.equal((await events(page)).runs.length, 0, 'nothing runs before a tap');

  // The script changed on the computer: one tap sends the shown version, and the
  // new command is shown for another tap instead of being approved automatically.
  await page.evaluate(() => window.run.model.replies.push({ approvalRequired: true, changed: true, name: 'HKE',
    command: 'npm run rust:dev -- --release', cwd: 'HKE', body: 'tauri dev --release', commandVersion: 'fedcba9876543210',
    targetId: '.::desktop-rust-dev' }));
  const shownVersion = '0123456789abcdef';
  await page.getByRole('button', { name: 'Run HKE on your computer', exact: true }).click();
  await page.getByText('This command changed. Check it, then run it again.').waitFor();
  await page.evaluate(() => Object.assign(window.run.model.rows.one, { commandVersion: 'fedcba9876543210',
    command: 'npm run rust:dev -- --release', body: 'tauri dev --release', changed: true }));
  await page.getByText('npm run rust:dev -- --release', { exact: true }).waitFor();
  await page.waitForTimeout(300);
  let seen = await events(page);
  assert.equal(seen.runs.length, 1, 'a changed command is never approved on the person’s behalf');
  assert.deepEqual(seen.runs[0], { projectId: 'one', targetId: '.::desktop-rust-dev', approve: true, commandVersion: shownVersion });
  await page.getByRole('button', { name: 'Run HKE on your computer', exact: true }).click();
  await page.waitForFunction(() => window.run.events.runs.length === 2);
  seen = await events(page);
  assert.deepEqual(seen.runs[1], { projectId: 'one', targetId: '.::desktop-rust-dev', approve: true, commandVersion: 'fedcba9876543210' });

  // Progress follows the computer's rows.
  await page.evaluate(() => window.run.set('one', { logTail: ['Compiling hke v0.1.0', 'Compiling tauri v2.0.0'] }));
  await page.getByRole('progressbar', { name: 'HKE: Build' }).waitFor();
  await page.getByText('Compiling tauri v2.0.0', { exact: true }).waitFor();
  await page.evaluate(() => window.run.set('one', { runState: 'waiting_for_window', logTail: [] }));
  await page.getByRole('progressbar', { name: 'HKE: Open window' }).waitFor();
  await page.getByRole('button', { name: 'Stop HKE', exact: true }).waitFor();

  // The window appears: it opens once, by itself, with no WindowConsent.
  await page.evaluate(([target]) => { window.run.model.targets = [target];
    window.run.set('one', { runState: 'ready', windowGrantId: target.grantId, autoOpen: true }); }, [windowTarget('b')]);
  await page.waitForFunction(() => window.run.events.opens.length === 1);
  const lists = (await events(page)).lists;
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.run.changed()); await page.waitForTimeout(250); }
  await page.evaluate(() => window.run.close());
  await page.waitForFunction(() => window.run.events.closes === 1);
  await page.evaluate(() => window.run.changed()); await page.waitForTimeout(2300);
  // Leaving and coming back (the chat remounts) does not open the same run again.
  await page.evaluate(() => window.run.project('two'));
  await page.getByRole('button', { name: 'Live preview. Run Other', exact: true }).waitFor();
  await page.evaluate(() => window.run.project('one'));
  await page.getByRole('button', { name: 'Live preview. HKE · Ready · Tap to view', exact: true }).waitFor();
  await page.waitForTimeout(500);
  seen = await events(page);
  assert.ok(seen.lists > lists, 'the list kept refreshing');
  assert.deepEqual(seen.opens, [grant('b')], 'a run’s window opens exactly once');

  // A failed run shows its error and Retry, which runs again (already approved).
  await page.evaluate(() => { window.run.model.targets = [];
    window.run.set('one', { runState: 'failed', error: 'cargo build failed: linker error', windowGrantId: null, autoOpen: false }); });
  await page.getByRole('button', { name: 'Live preview. Run HKE', exact: true }).click();
  await page.getByText('cargo build failed: linker error', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry HKE on your computer', exact: true }).click();
  await page.waitForFunction(() => window.run.events.runs.length === 3);
  assert.deepEqual((await events(page)).runs[2], { projectId: 'one', targetId: '.::desktop-rust-dev' });
  await page.getByRole('progressbar', { name: 'HKE: Build' }).waitFor();
  await page.getByRole('button', { name: 'Stop HKE', exact: true }).click();
  await page.waitForFunction(() => window.run.events.stops === 1);
  await page.evaluate(() => window.run.close());

  // An agent-approved run opens from the chat, with the sheet closed.
  await page.evaluate(([target]) => { window.run.model.targets = [target];
    window.run.set('one', { runState: 'ready', runId: 'd'.repeat(32), windowGrantId: target.grantId, autoOpen: true }); }, [windowTarget('e')]);
  await page.waitForFunction(() => window.run.events.opens.length === 2);
  assert.equal((await events(page)).opens[1], grant('e'));
  await page.evaluate(() => window.run.close());
  await page.waitForFunction(() => window.run.events.closes === 2);

  // A late window for a project the person has left does not open.
  await page.evaluate(() => { window.run.model.targets = [];
    window.run.set('one', { runState: 'building', runId: 'f'.repeat(32), windowGrantId: null, autoOpen: false }); });
  await page.evaluate(() => window.run.project('two'));
  await page.getByRole('button', { name: 'Live preview. Run Other', exact: true }).waitFor();
  await page.evaluate(([target]) => { window.run.model.targets = [target];
    window.run.set('one', { runState: 'ready', windowGrantId: target.grantId, autoOpen: true }); }, [windowTarget('c')]);
  await page.waitForTimeout(2500);
  assert.equal((await events(page)).opens.length, 2, 'a late window after switching project never opens');

  // A running app with a window offers View, and View opens that window.
  await page.evaluate(() => { window.run.project('one'); window.run.model.targets = [];
    window.run.set('one', { runState: 'ready', runId: '7'.repeat(32), windowGrantId: 'a'.repeat(32), autoOpen: false }); });
  await page.getByRole('button', { name: 'Live preview. HKE · Ready · Tap to view', exact: true }).click();
  await page.getByRole('button', { name: 'View window', exact: true }).click();
  await page.waitForFunction(() => window.run.events.opens.length === 3);
  assert.equal((await events(page)).opens[2], grant('a'), 'View opens the window this phone was granted');
  await page.evaluate(() => window.run.close());
  await page.waitForFunction(() => window.run.events.closes === 3);

  // Running with two windows and no grant of its own: it does not guess which one is its.
  await page.evaluate(([one, two]) => { window.run.model.targets = [one, two];
    window.run.set('one', { runState: 'ready', windowGrantId: null }); window.run.open(); }, [windowTarget('f'), windowTarget('g')]);
  await page.getByRole('button', { name: 'Open HKE' }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open HKE' }).count(), 2, 'both windows are listed');
  assert.equal(await page.getByRole('button', { name: 'View window' }).count(), 0, 'no View for an ambiguous window');
  await page.evaluate(() => { window.run.close(); window.run.model.targets = [];
    window.run.set('one', { runState: 'building', windowGrantId: null }); });

  // A chat whose project has its own id for the same folder: Run and Stop still name the
  // computer's project for the row, which is the only id the computer can find.
  await page.evaluate(() => { window.run.set('one', { runState: 'idle', runId: undefined, approvalRequired: false,
    windowGrantId: null, autoOpen: false, error: null, logTail: [] });
    // The computer also lists the folder under the chat's project, where the app would ask again.
    window.run.model.rows.dup = { ...window.run.model.rows.one, projectId: 'chat-one', approvalRequired: true };
    window.run.project('chat-one'); });
  const before = (await events(page)).runs.length;
  await page.getByRole('button', { name: 'Live preview. Run HKE', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Run HKE on your computer', exact: true }).count(), 1, 'a folder listed twice shows its app once');
  await page.getByRole('button', { name: 'Run HKE on your computer', exact: true }).click();
  await page.waitForFunction(count => window.run.events.runs.length === count + 1, before);
  assert.equal((await events(page)).runs.at(-1).approve, undefined, 'the approved row is the one that runs, without asking again');
  assert.equal((await events(page)).runs.at(-1).projectId, 'one', 'Run names the computer\'s project, not the chat\'s');
  const stopped = (await events(page)).stopped.length;
  await page.getByRole('button', { name: 'Stop HKE', exact: true }).click();
  await page.waitForFunction(count => window.run.events.stopped.length === count + 1, stopped);
  assert.equal((await events(page)).stopped.at(-1), 'one', 'Stop names the computer\'s project too');
  await page.evaluate(() => { window.run.close(); delete window.run.model.rows.dup; });

  // The agent's approval card shows the app, its folder and script above the command.
  await page.evaluate(() => window.run.dock());
  await page.getByText('Run HKE on your computer?', { exact: true }).waitFor();
  await page.getByText('In HKE · outside the agent sandbox', { exact: true }).waitFor();
  await page.getByText('$ npm run rust:dev', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Run', exact: true }).waitFor();

  // A computer without previewRunV1 shows no Run UI at all.
  await page.evaluate(() => { window.run.model.targets = []; window.run.project('one'); window.run.oldComputer(); });
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('button', { name: /^Live preview\./ }).count(), 0);
  await page.evaluate(() => window.run.open());
  await page.getByText('Ready when your project is').waitFor();
  assert.equal(await page.getByText('Run this project’s app').count(), 0);

  // Copy names the host: a PC as a PC, a Mac exactly as before.
  await page.evaluate(() => window.run.platform('windows'));
  await page.getByText(/attach its window from Preview on your PC\./).waitFor();
  await page.evaluate(() => window.run.platform('macos'));
  await page.getByText(/attach its window from Mac Preview\./).waitFor();
  await page.evaluate(() => { window.run.close(); window.run.platform('windows');
    window.run.targets([{ grantId: '9'.repeat(32), projectId: 'one', targetId: 'auto-port:5173', running: true }]); });
  await page.getByRole('button', { name: 'Live preview. localhost:5173 is running on your PC', exact: true }).waitFor();
  await page.evaluate(() => window.run.platform('macos'));
  await page.getByRole('button', { name: 'Live preview. localhost:5173 is running on your Mac', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Run shows the exact command; a changed command asks again; progress renders; the window opens once per run; failures retry; late rows and old computers stay quiet; copy names a PC or a Mac.');
} finally { await browser.close(); close(); }
