import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { verifyMirror } from './terminal-mirror-checks.mjs';

const source = await readFile(new URL('../src/generated/terminal.ts', import.meta.url), 'utf8');
const html = JSON.parse(source.split('export const terminalHtml = ')[1].trim().replace(/;$/, ''));
const browser = await chromium.launch({ executablePath: chromePath(),
  headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<iframe title="Terminal" sandbox="allow-scripts" style="width:100%;height:650px;border:0"></iframe>');
  await page.evaluate(html => {
    window.notices = [];
    window.addEventListener('message', event => {
      try { window.notices.push(JSON.parse(event.data)); } catch {}
    });
    document.querySelector('iframe').srcdoc = html;
  }, html);
  await page.waitForFunction(() => window.notices.some(item => item.type === 'ready'));
  const theme = { background: '#101115', foreground: '#F5F7FA', cursor: '#5B7CFA' };
  const send = value => page.evaluate(value => document.querySelector('iframe').contentWindow.postMessage(
    JSON.stringify({ target: 'vibyra-terminal', ...value }), '*'), value);
  const state = disabled => send({ type: 'state', disabled, theme });
  const output = (data, reset = false, grid) => send({ type: 'output', data, reset, ...(grid ? { grid } : {}) });
  await state(true);
  await output('\x1b[2J\x1b[H\x1b[32mready\x1b[0m\r\nλ 日本語 ✓', true);
  const frame = page.frames()[1];
  await frame.waitForFunction(() => document.body.textContent.includes('日本語'));
  assert.match(await frame.locator('body').innerText(), /ready/);
  // Observing: keystrokes go nowhere. The keyboard, when it comes, must not rewrite what is typed.
  assert.equal(await frame.getAttribute('textarea', 'autocorrect'), 'off', 'the phone keyboard is told to leave typing alone');
  await frame.locator('textarea').focus();
  await page.keyboard.type('ignored');
  assert.equal(await page.evaluate(() => window.notices.filter(item => item.type === 'input').length), 0);
  await state(false);
  await page.waitForFunction(() => window.notices.some(item => item.type === 'resize'));
  await frame.locator('textarea').focus();
  await page.keyboard.type('hello');
  await page.waitForFunction(() => window.notices.filter(item => item.type === 'input').map(item => item.data).join('').includes('hello'));
  // Only new bytes arrive; the renderer appends rather than redrawing everything.
  await output('\r\nresumed');
  await frame.waitForFunction(() => document.body.textContent.includes('resumed'));
  assert.equal((await frame.locator('body').innerText()).match(/ready/g)?.length, 1);
  await output('replacement snapshot', true);
  await frame.waitForFunction(() => document.body.textContent.includes('replacement snapshot'));
  assert.doesNotMatch(await frame.locator('body').innerText(), /resumed/);
  // A phone is narrower than the ~80 columns tools format for, and the terminal
  // used to report more rows than fit, slicing the newest line in half.
  const fit = await frame.evaluate(() => {
    const view = document.getElementById('terminal');
    const rows = view.querySelector('.xterm-rows');
    const row = rows.firstElementChild.getBoundingClientRect().height;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    const style = getComputedStyle(rows);
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.textContent = 'M'.repeat(50);
    document.body.appendChild(probe);
    const cell = probe.getBoundingClientRect().width / 50;
    probe.remove();
    return { rows: rows.children.length, row, height: view.clientHeight, width: view.clientWidth,
      cols: Math.floor(view.clientWidth / cell), padding: getComputedStyle(view).padding };
  });
  assert.equal(fit.padding, '0px', 'the fitted element carries no padding of its own to mismeasure');
  assert.ok(fit.rows * fit.row <= fit.height + 1,
    `${fit.rows} rows of ${fit.row}px overflow a ${fit.height}px terminal, clipping the newest line`);
  assert.ok(fit.height - fit.rows * fit.row < fit.row, 'the terminal wastes less than a row of height');
  assert.ok(fit.cols >= 40, `a 390px phone terminal must stay usable, got ${fit.cols} columns`);
  const reported = async () => (await page.evaluate(
    () => window.notices.filter(item => item.type === 'resize').at(-1))) ?? {};
  const grid = async () => ({
    ...(await reported()),
    ...(await frame.evaluate(() => ({
      fontSize: parseFloat(getComputedStyle(document.querySelector('.xterm-rows')).fontSize),
      transform: getComputedStyle(document.getElementById('terminal')).transform,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))),
  });
  const before = await grid();
  assert.ok(before.fontSize >= 11, `terminal type must stay readable, got ${before.fontSize}px`);
  assert.ok(before.cols >= 40, `a 390px phone should reach a usable width, got ${before.cols}`);
  assert.ok(before.overflow <= 1, `nothing may scroll sideways, overflowed by ${before.overflow}px`);
  assert.ok(before.transform === 'none', 'the grid is never scaled; the type size is the control');

  // History drawn for the computer's grid is laid out at that width and then
  // reflowed, so a 120-column line reads as two wrapped rows rather than as
  // fragments — and the computer's width is never reported back as the phone's.
  const wide = 'A'.repeat(60) + 'B'.repeat(60);
  const resizesBefore = (await page.evaluate(() => window.notices.filter(item => item.type === 'resize'))).length;
  await output(`${wide}\r\nafter`, true, { cols: 120, rows: 40 });
  await frame.waitForFunction(() => document.body.textContent.includes('after'));
  const reflowed = await frame.evaluate(() => Array.from(document.querySelectorAll('.xterm-rows > div'))
    .map(row => row.textContent.trim()).filter(Boolean));
  assert.ok(reflowed[0].startsWith('AAAA') && reflowed[0].length < 120, `the wide line was reflowed, first row is ${reflowed[0].length} cells`);
  assert.ok(reflowed.some(row => row.endsWith('BBBB')), 'the end of the wide line is on a later row, not lost');
  const resizes = await page.evaluate(() => window.notices.filter(item => item.type === 'resize'));
  assert.ok(resizes.slice(resizesBefore).every(item => item.cols < 120),
    `the computer's own 120 columns must not be reported back to it: ${JSON.stringify(resizes.slice(resizesBefore))}`);
  assert.equal(resizes.at(-1).cols, before.cols, 'the phone ends up back on its own grid');

  // Scrolling up stops the view following new output, and says so; a jump returns.
  await output(Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\r\n'), true);
  await frame.waitForFunction(() => document.body.textContent.includes('line 199'));
  // A finger's drag is a run of scroll events, never one; xterm treats the
  // first after its own sync as that sync, so a single jump is not a drag.
  for (const top of [1200, 600, 0]) {
    await frame.evaluate(top => { document.querySelector('.xterm-viewport').scrollTop = top; }, top);
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.notices.some(item => item.type === 'follow' && item.atBottom === false));
  await send({ type: 'scroll', to: 'bottom' });
  await page.waitForFunction(() => window.notices.filter(item => item.type === 'follow').at(-1)?.atBottom === true);

  // A larger type size must buy fewer columns and tell the computer so.
  await send({ type: 'state', disabled: true, fontSize: 18, theme });
  await frame.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.xterm-rows')).fontSize) >= 17);
  const after = await grid();
  assert.ok(after.cols < before.cols, `bigger type must mean fewer columns: ${before.cols} -> ${after.cols}`);
  assert.ok(after.overflow <= 1, 'a larger type size must still not scroll sideways');
  assert.ok(Number.isInteger(after.cols), 'the computer must be told the new column count, or it lays out for the old one');

  const { surface, fitted, zoomed } = await verifyMirror({ page, frame, send, output, theme });
  await send({ type: 'state', disabled: true, fontSize: 18, theme });
  await frame.waitForFunction(() => document.querySelector('.xterm-rows').children.length < 42);
  const restored = await grid();
  assert.equal(restored.cols, after.cols, `without a Mac grid the phone lays out for itself again: ${restored.cols} columns`);
  assert.equal(await frame.evaluate(() => getComputedStyle(document.getElementById('stage')).transform), 'none');
  await page.waitForTimeout(400);

  // A tap gives the terminal's own input the keyboard the moment it lands,
  // and the next tap takes it away; while the computer refuses typing a tap
  // leaves the keyboard down. The second tap of a double is spent on the type
  // size and never toggles the keyboard. Last, because the double tap changes
  // the type size the checks above measure.
  await frame.evaluate(() => document.activeElement?.blur());
  const tapsSoFar = await page.evaluate(() => window.notices.filter(item => item.type === 'tap').length);
  const taps = async () => (await page.evaluate(() => window.notices.filter(item => item.type === 'tap').length)) - tapsSoFar;
  const focused = () => frame.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
  const tap = () => page.touchscreen.tap(surface.x + surface.width / 2, surface.y + surface.height / 2); // `surface`: measured above
  const tapped = async count => { await tap(); await page.waitForFunction(n => window.notices.filter(item => item.type === 'tap').length === n, tapsSoFar + count); };
  // Taps land as soon as the finger lifts, so consecutive single taps must sit
  // further apart than the 320 ms double-tap window or the second is a double.
  const apart = () => page.waitForTimeout(400);
  await tapped(1);
  assert.equal(await focused(), false, 'a tap never raises the keyboard while observing');
  await state(false);
  await apart();
  await tapped(2);
  assert.equal(await focused(), true, 'a tap gives the terminal the keyboard');
  await apart();
  await tapped(3);
  assert.equal(await focused(), false, 'the next tap puts the keyboard away');
  await apart();
  await tap(); await tap();
  await page.waitForTimeout(600);
  assert.equal(await taps(), 4, 'the first tap of a double counts, the second is the type-size reset');
  assert.equal(await focused(), true, 'a double tap raises the keyboard once and resets the type size; the second tap does not put it away');

  assert.deepEqual(errors, []);
  console.log('PASS: bundled terminal, ANSI/Unicode, observing blocks input and the keyboard, tap types into the terminal, delta writes, replacement snapshots.');
  console.log(`PASS: ${fit.cols}x${fit.rows} on a ${fit.width}px phone, whole rows only; history reflowed from 120 columns.`);
  console.log(`PASS: type size drives the grid — ${before.fontSize}px/${before.cols} cols to ${after.fontSize}px/${after.cols} cols, follow state reported.`);
  console.log(`PASS: a Mac's 158x42 grid is mirrored at scale ${fitted.scale.toFixed(2)}, double tap zooms to ${zoomed.scale.toFixed(2)}, and the Mac is never resized.`);
} finally { await browser.close(); }
