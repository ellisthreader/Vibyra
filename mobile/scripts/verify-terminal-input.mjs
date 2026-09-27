// Types into the terminal box against a real Host and checks the command ran on
// the computer and came back in the terminal. The connect flow has no pairing
// code page, so the invitation is handed to the fixture directly.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
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
  browser = await chromium.launch({ executablePath: chromePath(),
    headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
    colorScheme: 'dark', isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${served.url}/?invitation=${encodeURIComponent(JSON.stringify(pairing))}`);

  // No box: the terminal itself is typed into, and the computer's echo is what shows.
  const terminal = page.locator('iframe[title="Interactive terminal"]');
  await terminal.waitFor({ timeout: 30000 });
  await terminalText(page, '$');
  assert.equal(await page.getByRole('textbox', { name: 'Command for computer terminal' }).count(), 0, 'no box under the terminal');

  // Type it, press return, and let the computer answer.
  await terminal.click();
  await page.keyboard.type("printf 'TYPED_%s_VERIFIED\\n' INTO_THE_TERMINAL | tee typed.txt");
  await page.keyboard.press('Enter');
  await until(() => { try { return readFileSync(join(fixture, 'typed.txt'), 'utf8') === 'TYPED_INTO_THE_TERMINAL_VERIFIED\n'; }
    catch { return false; } }, 'the typed command running on the computer');
  await terminalText(page, 'TYPED_INTO_THE_TERMINAL_VERIFIED');

  // Return runs the command, as in any terminal.
  await page.keyboard.type('echo second');
  await page.keyboard.press('Enter');
  await terminalText(page, 'second');

  // One view only, and nothing under the output: no box, no key strip.
  assert.deepEqual(await page.getByRole('tab').allInnerTexts(), [], 'a terminal session shows no view tabs');
  assert.equal(await page.getByRole('toolbar', { name: 'Terminal keys' }).count(), 0, 'no key strip under the terminal');
  assert.deepEqual(errors, []);
  console.log('PASS terminal input: a command typed into the terminal runs on the computer and returns in it.');
} finally {
  if (browser) await browser.close();
  served?.close();
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'host shutdown', 5000).catch(() => child.kill('SIGKILL'));
  rmSync(fixture, { recursive: true, force: true });
}
