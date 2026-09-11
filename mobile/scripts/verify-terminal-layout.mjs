// Checks the shape of a terminal session in the whole app shell: the chat title
// in the middle of the top bar, no view tabs, and one line to type into beside
// its send button. The sample workspace is used because it renders the real
// shell without pairing, which the connect flow no longer offers by code.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const shots = process.env.SHOT_DIR ?? '/tmp/vibyra-terminal-layout';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    colorScheme: 'dark', isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.VIBYRA_URL ?? 'http://localhost:8081'}/?demo=1`);
  await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor({ timeout: 60000 });

  // Open a sample Terminal session, which renders the same screen a live one does.
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, 'web-drawer.png') });
  const terminal = page.getByRole('button', { name: /, Terminal$/ }).first();
  await terminal.waitFor({ timeout: 20000 });
  const title = (await terminal.getAttribute('aria-label') ?? '').replace(/, Terminal$/, '');
  await terminal.click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(shots, 'web-terminal-session.png') });

  // The session title is the heading in the middle of the top bar.
  const heading = page.getByRole('button', { name: 'Switch chat', exact: true });
  await heading.waitFor();
  const box = await heading.boundingBox();
  const centred = Math.abs((box.x + box.width / 2) - 195);
  assert.ok(await heading.innerText().then(text => text.includes(title)),
    `the top bar shows the chat title "${title}"`);
  assert.ok(box.y < 120, 'the title sits in the top bar');
  assert.ok(centred < 24, `the title is centred (off by ${centred.toFixed(0)}px)`);

  // One view only: no Chat/Terminal switch on a terminal session.
  const tabs = await page.getByRole('tab').allInnerTexts();
  assert.deepEqual(tabs, [], `a terminal session shows no view tabs, found ${JSON.stringify(tabs)}`);

  // A single-row box to type into, with its send button beside it.
  const input = page.getByRole('textbox', { name: 'Command for computer terminal' });
  const send = page.getByRole('button', { name: 'Send command and Enter', exact: true });
  const inputBox = await input.boundingBox();
  const sendBox = await send.boundingBox();
  assert.ok(Math.abs((inputBox.y + inputBox.height / 2) - (sendBox.y + sendBox.height / 2)) < 20,
    'the send button sits on the same row as the box');
  assert.ok(inputBox.height < 50, `the terminal box is one line, not ${inputBox.height}px tall`);
  assert.equal(await page.getByText('Runs on your computer').count(), 0, 'no caption under the box');

  assert.deepEqual(errors, []);
  console.log(`PASS header/layout: title "${title}" centred at the top, no view tabs, ${inputBox.height}px input beside its send button.`);
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
