// Types into the terminal box against a real Host and checks the command ran on
// the computer and came back in the terminal. The connect flow has no pairing
// code page, so the invitation is handed to the fixture directly.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { terminalText, until } from './ui-test-helpers.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'vibyra-terminal-input-'));
writeFileSync(join(fixture, 'README.md'), 'Isolated terminal input verification project.\n');
const binary = process.env.VIBYRA_HOST_BINARY ?? resolve('../host/target/debug/vibyra-host');
const child = spawn(binary, ['--name', 'Terminal Input Computer', '--state-dir', join(fixture, '.state'),
  '--project', fixture, '--listen', '127.0.0.1:0', '--pair'], { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', approved = false;
const approve = () => {
  const key = output.match(/Approve or deny device ([a-f0-9]{64})/)?.[1];
  if (key && !approved) { approved = true; child.stdin.write(`approve ${key}\n`); }
};
child.stdout.on('data', bytes => { output += bytes.toString(); approve(); });
child.stderr.on('data', bytes => { output += bytes.toString(); approve(); });

let served, browser;
try {
  const encoded = await until(() => output.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'invitation');
  const address = await until(() => output.match(/listening on ([\d.:]+)/)?.[1], 'listener');
  const pairing = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  pairing.url = `ws://${address}`;
  served = await serveFixture('tests/terminalHostFixture.tsx');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
    colorScheme: 'dark', isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${served.url}/?invitation=${encodeURIComponent(JSON.stringify(pairing))}`);

  const input = page.getByRole('textbox', { name: 'Command for computer terminal' });
  await input.waitFor({ timeout: 30000 });
  await terminalText(page, '$');

  // Type it, press return, and let the computer answer.
  await input.click();
  await page.keyboard.type("printf 'TYPED_%s_VERIFIED\\n' INTO_THE_BOX | tee typed.txt");
  await page.keyboard.press('Enter');
  await until(() => { try { return readFileSync(join(fixture, 'typed.txt'), 'utf8') === 'TYPED_INTO_THE_BOX_VERIFIED\n'; }
    catch { return false; } }, 'the typed command running on the computer');
  await terminalText(page, 'TYPED_INTO_THE_BOX_VERIFIED');
  assert.equal(await input.inputValue(), '', 'the box clears once the command is sent');

  // Return runs the command rather than opening a second line in the box.
  await input.click();
  await page.keyboard.type('echo second');
  await page.keyboard.press('Enter');
  await terminalText(page, 'second');
  assert.equal(await input.inputValue(), '');

  // One view only, and the keys bar still reaches the shell.
  assert.deepEqual(await page.getByRole('tab').allInnerTexts(), [], 'a terminal session shows no view tabs');
  await page.getByRole('button', { name: 'Interrupt terminal command', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS terminal input: typed command runs on the computer, returns in the terminal and clears the box.');
} finally {
  if (browser) await browser.close();
  served?.close();
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'host shutdown', 5000).catch(() => child.kill('SIGKILL'));
  rmSync(fixture, { recursive: true, force: true });
}
