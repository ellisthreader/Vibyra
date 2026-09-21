import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { noTutorialFraming, terminalText, until } from './ui-test-helpers.mjs';

// The app no longer offers a pairing-code entry, and on the web the deep link
// this script would otherwise open (vibyra://pair) never reaches the store, so
// there is no way in from the full app at Metro. The targeted harnesses that
// inject an invitation (verify:reconnect, verify:nearby) cover the Host; this
// walkthrough needs rework before it is acceptance again.
if (!process.env.VIBYRA_HOST_UI_REWORKED) {
  console.error('verify-host-ui.mjs needs rework: the "I have a pairing code" entry was removed from the app '
    + 'and the web build cannot open a vibyra://pair invitation. Use verify:reconnect and verify:nearby for the Host.');
  process.exit(2);
}
const hostRoot = resolve('../host');
const metadata = JSON.parse(execFileSync('cargo', ['+1.97.1', 'metadata', '--format-version', '1', '--no-deps'], { cwd: hostRoot }));
const binary = join(metadata.target_directory, 'debug', process.platform === 'win32' ? 'vibyra-host.exe' : 'vibyra-host');
const fixture = mkdtempSync(join(tmpdir(), 'vibyra-ui-host-'));
writeFileSync(join(fixture, 'hello.txt'), 'Original project file\n');
execFileSync('git', ['init', '-q'], { cwd: fixture });
execFileSync('git', ['add', 'hello.txt'], { cwd: fixture });
execFileSync('git', ['-c', 'user.name=Vibyra Test', '-c', 'user.email=test@localhost', 'commit', '-qm', 'Fixture'], { cwd: fixture });
writeFileSync(join(fixture, 'hello.txt'), 'Verified project file\n');
const child = spawn(binary, ['--name', 'UI Test Computer', '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', '127.0.0.1:0', '--pair'], { stdio: ['pipe', 'pipe', 'pipe'] });
let hostOutput = '';
child.stdout.on('data', bytes => { hostOutput += bytes.toString(); });
child.stderr.on('data', () => {});
const browser = await chromium.launch({ executablePath: chromePath(),
  headless: true, args: ['--no-sandbox'] });
try {
  const uri = await until(() => hostOutput.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'invitation');
  const address = await until(() => hostOutput.match(/listening on ([\d.:]+)/)?.[1], 'listener');
  const pairing = JSON.parse(Buffer.from(uri, 'base64url').toString());
  pairing.url = `ws://${address}`;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const menu = async name => {
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  };
  // Naming a session is only offered inside a folder's face of the rail, where
  // choosing the folder is the point. The home composer starts a terminal in one tap instead.
  const openTerminal = async title => {
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    // Tapping a folder's row in the rail enters it and swaps the rail to its face, where its actions are rows.
    await page.getByRole('button', { name: new RegExp('^' + basename(fixture)) }).first().click();
    await page.getByRole('button', { name: /^New chat in / }).first().click();
    // The New terminal sheet has no radios or "Open terminal" button: name the
    // session, then tap the kind's row (Claude Code, Codex, Terminal) to start it.
    await page.getByRole('textbox', { name: 'Session name' }).fill(title);
    await page.getByRole('button', { name: 'Terminal', exact: true }).click();
    await page.getByText(title, { exact: true }).first().waitFor();
  };
  await page.goto(process.env.VIBYRA_URL ?? 'http://localhost:8081');
  await noTutorialFraming(page);
  // Pair from inside the first-run flow: a successful pairing must finish it and land on the workspace.
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await page.getByRole('button', { name: 'Connect computer', exact: true }).click();
  await page.getByRole('button', { name: 'I have a pairing code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Computer pairing link' }).fill(JSON.stringify(pairing));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const key = await until(() => hostOutput.match(/Approve or deny device ([a-f0-9]{64})/)?.[1], 'local approval request');
  child.stdin.write(`approve ${key}\n`);
  await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Get started', exact: true }).count(), 0, 'Pairing completes the welcome flow');
  await openTerminal('Verified UI terminal');
  // No box: the terminal itself is typed into.
  const terminal = page.locator('iframe[title="Interactive terminal"]');
  const type = async text => { await terminal.click(); await page.keyboard.type(text); await page.keyboard.press('Enter'); };
  await type("printf 'UI_%s_VERIFIED\\n' EXECUTION | tee ui-result.txt");
  await until(() => { try { return readFileSync(join(fixture, 'ui-result.txt'), 'utf8') === 'UI_EXECUTION_VERIFIED\n'; } catch { return false; } }, 'real command effect');
  await terminalText(page, 'UI_EXECUTION_VERIFIED');
  await openTerminal('Independent UI terminal');
  const second = await terminalText(page, '$');
  assert.equal(await second.locator('body').innerText().then(text => text.includes('UI_EXECUTION_VERIFIED')), false,
    'The first terminal output must not appear in a new terminal');
  await menu('Verified UI terminal, Terminal');
  await page.getByText('Viewing live', { exact: true }).waitFor();
  await page.locator('iframe[title="Terminal output, observing"]').waitFor();
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await terminal.waitFor();
  await page.getByRole('button', { name: 'Session options', exact: true }).click();
  await page.getByRole('button', { name: 'Review files and changes', exact: true }).click();
  await page.getByText('+Verified project file', { exact: false }).waitFor();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByText('hello.txt', { exact: true }).click();
  await page.getByText('Verified project file', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Close / }).click();
  await menu('Remote');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByText('Connected', { exact: true }).waitFor();
  await menu('Verified UI terminal, Terminal');
  await page.getByText('Viewing live', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await type("printf 'UI_%s_VERIFIED\\n' RECONNECTED >> ui-result.txt");
  await until(() => readFileSync(join(fixture, 'ui-result.txt'), 'utf8').includes('UI_RECONNECTED_VERIFIED'), 'continued real session');
  await page.getByRole('button', { name: 'Session options', exact: true }).click();
  await page.getByRole('button', { name: 'Stop session', exact: true }).click();
  await page.getByText(/Session ended/).waitFor();
  await noTutorialFraming(page);
  assert.deepEqual(errors, []);
  console.log('PASS: real Host pairing, two isolated terminals/drafts, input effects, diff/files, reconnect, observation/control and stop.');
  console.log('This verifies standalone Host CLI sessions; existing Vibyra Desktop chat synchronization is not implemented.');
} finally {
  await browser.close(); child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'host shutdown', 3000).catch(() => child.kill('SIGKILL'));
  rmSync(fixture, { recursive: true, force: true });
}
