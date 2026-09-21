// Checks the shape of a terminal session in the whole app shell: the chat title
// in the middle of the top bar, no view tabs, no project row, no box and no
// key strip — the terminal itself is typed into and fills the screen down to
// the bottom. The sample workspace is used because it renders the real shell
// without pairing, which the connect flow no longer offers by code.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';

const shots = process.env.SHOT_DIR ?? '/tmp/vibyra-terminal-layout';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath(),
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
  // The rail has two faces: the home face lists the projects, and a project's row
  // swaps it to that project's face, where its terminals are rows labelled
  // "<title>, Terminal, <state>" (src/ui/ProjectTerminalRow.tsx).
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, 'web-drawer.png') });
  await page.getByRole('button', { name: /^Studio/ }).first().click();
  const terminal = page.getByRole('button', { name: /, Terminal, / }).first();
  await terminal.waitFor({ timeout: 20000 });
  const title = (await terminal.getAttribute('aria-label') ?? '').replace(/, Terminal, .*$/, '');
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

  // Nothing between the header and the output, and no box under it: the terminal is what you type into.
  assert.equal(await page.getByRole('button', { name: 'Open session project', exact: true }).count(), 0, 'no project row');
  assert.equal(await page.getByRole('textbox', { name: 'Command for computer terminal' }).count(), 0, 'no box under the terminal');
  const surface = page.locator('iframe[title="Interactive terminal"]');
  await surface.waitFor();
  const output = await surface.boundingBox();
  assert.ok(output.y < 130, `the output starts right under the header, at ${output.y.toFixed(0)}px`);
  assert.equal(await page.getByRole('toolbar', { name: 'Terminal keys' }).count(), 0, 'no key strip under the output');
  assert.equal(await page.getByRole('button', { name: 'Send Escape', exact: true }).count(), 0, 'no key strip under the output');
  assert.ok(output.y + output.height >= 844 - 8, `the output reaches the bottom of the screen, ends at ${(output.y + output.height).toFixed(0)}px`);

  assert.deepEqual(errors, []);
  console.log(`PASS header/layout: title "${title}" centred at the top, no view tabs, no project row, no box, no key strip; the output fills the screen.`);
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
