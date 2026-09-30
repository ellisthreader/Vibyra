// Types into a Vibyra Desktop terminal from the phone and checks the command ran
// on the Mac. The Mac side is the desktop's own phone backend with a real shell
// (desktop-tauri/src-tauri/examples/phone_typing_probe.rs) over the encrypted
// transport; the phone side is the real session screen, in a browser. Build the
// probe first: cargo build --example phone_typing_probe (in desktop-tauri/src-tauri).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { serveFixture } from './fixture-server.mjs';
import { terminalText, until } from './ui-test-helpers.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'vibyra-desktop-typing-'));
writeFileSync(join(fixture, 'README.md'), 'Isolated desktop typing verification project.\n');
const probe = process.env.VIBYRA_TYPING_PROBE
  ?? resolve('../desktop-tauri/src-tauri/target/debug/examples/phone_typing_probe');
const child = spawn(probe, ['--project', fixture, '--state-dir', join(fixture, '.state')],
  { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', approved = false;
const approve = () => {
  const key = output.match(/Approve or deny device ([a-f0-9]{64})/)?.[1];
  if (key && !approved) { approved = true; child.stdin.write(`approve ${key}\n`); }
};
child.stdout.on('data', bytes => { output += bytes.toString(); approve(); });
child.stderr.on('data', bytes => { output += bytes.toString(); approve(); });
const typed = () => { try { return readFileSync(join(fixture, 'typed.txt'), 'utf8'); } catch { return null; } };
// Watching renders the same terminal under another title; `terminalText` wants
// the interactive one, so the watching phases read whichever is mounted.
const shownText = async (page, text) => {
  const frame = await page.locator('iframe[title="Terminal output, observing"]').contentFrame();
  await frame.locator('body').filter({ hasText: text }).waitFor({ timeout: 10000 });
  return frame;
};

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
  await page.goto(`${served.url}/?existing=1&invitation=${encodeURIComponent(JSON.stringify(pairing))}`);

  // Typing is off on the Mac: the strip names the switch and where it is, no
  // output stays readable and the chat composer cannot dispatch without control.
  const off = page.getByText('Typing from your phone is off', { exact: false });
  await off.waitFor({ timeout: 30000 });
  await shownText(page, '$');
  assert.equal(await page.getByText('Watching your Mac').count(), 0, 'no watching panel');
  assert.equal(await page.getByRole('textbox', { name: 'Command for computer terminal' }).count(), 1, 'the chat composer stays available for drafts');
  assert.equal(await page.getByRole('toolbar', { name: 'Terminal keys' }).count(), 0, 'no key strip under the terminal');

  await page.getByRole('textbox', { name: 'Command for computer terminal' }).fill('echo blocked');
  assert.equal(await page.getByRole('button', {name:'Send command and Enter',exact:true}).isDisabled(),true);
  await page.getByRole('textbox', { name: 'Command for computer terminal' }).fill('');

  // Turned on at the Mac, the open phone follows without reconnecting — and
  // takes the terminal itself, so typing simply works, with no "Take
  // control" step in between.
  child.stdin.write('typing on\n');
  await until(async () => await off.count() === 0 && await page.locator('iframe[title="Interactive terminal"]').count() === 1,
    'the strip to clear and the terminal to accept typing', 15000);
  assert.equal(await page.getByRole('button', { name: 'Take control of this terminal' }).count(), 0,
    'control was taken on the phone\'s behalf; no button to press');
  await page.screenshot({ path: process.env.SHOT ?? '/tmp/vibyra-desktop-typing.png' });

  // A tap on the output gives the terminal the keyboard; another puts it away.
  const terminal = page.locator('iframe[title="Interactive terminal"]');
  // The terminal's frame is the one with xterm's textarea; the transport runtime is another.
  const focused = async () => {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || await frame.locator('textarea').count() === 0) continue;
      return frame.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
    }
    return false;
  };
  await terminal.tap();
  await until(focused, 'a tap on the terminal to raise its keyboard', 5000);
  await page.waitForTimeout(400);
  await terminal.tap();
  await until(async () => !await focused(), 'a second tap to put the keyboard away', 5000);

  // Return with nothing typed is Enter itself: it answers the shell's `read`.
  await terminal.click();
  await page.keyboard.type("read line; printf 'EMPTY_%s\\n' ENTER");
  await page.keyboard.press('Enter');
  await terminalText(page, 'read line');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await terminalText(page, 'EMPTY_ENTER');

  // Smart Punctuation's curly quotes reach the shell as the quotes that were typed.
  await page.keyboard.type("printf 'Q%sQ\\n' “X”");
  await page.keyboard.press('Enter');
  await terminalText(page, 'QXQ');
  await page.keyboard.type("printf 'TYPED_%s_ON_THE_MAC\\n' FROM_THE_PHONE | tee typed.txt");
  await page.keyboard.press('Enter');
  await until(() => typed() === 'TYPED_FROM_THE_PHONE_ON_THE_MAC\n', 'the typed command running on the Mac');
  await terminalText(page, 'TYPED_FROM_THE_PHONE_ON_THE_MAC');

  // Control keys reach it too: Ctrl-C typed into the terminal interrupts what
  // the Mac is running (there is no key strip; xterm turns the chord into ^C).
  // Markers are assembled by printf, because the terminal echoes the typed line:
  // only output can contain them, so an echo cannot pass for a command running.
  await page.keyboard.type('sleep 60');
  await page.keyboard.press('Enter');
  const live = await terminalText(page, 'sleep 60');
  await page.waitForTimeout(500); // the shell has the line; let the sleep begin
  await page.keyboard.press('Control+c');
  await page.keyboard.type("printf 'AFTER_%s\\n' INTERRUPT");
  await page.keyboard.press('Enter');
  // Well inside the minute the sleep would hold the shell, so only an interrupt gets here.
  await live.waitForFunction(value => document.body.textContent.includes(value), 'AFTER_INTERRUPT', { timeout: 15000 });

  // Turned off again, the strip says so.
  child.stdin.write('typing off\n');
  await off.waitFor({ timeout: 10000 });
  await shownText(page, 'AFTER_INTERRUPT');
  assert.deepEqual(errors, []);
  console.log('PASS desktop typing: the phone types into a Mac terminal only while the Mac allows it.');
} finally {
  if (browser) await browser.close();
  served?.close();
  child.kill('SIGINT');
  await until(() => child.exitCode !== null || child.signalCode !== null, 'probe shutdown', 5000).catch(() => child.kill('SIGKILL'));
  rmSync(fixture, { recursive: true, force: true });
}
