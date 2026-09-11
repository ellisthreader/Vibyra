import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const source = await readFile(new URL('../src/generated/terminal.ts', import.meta.url), 'utf8');
const html = JSON.parse(source.split('export const terminalHtml = ')[1].trim().replace(/;$/, ''));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
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
  const state = { target: 'vibyra-terminal', type: 'state', disabled: true,
    output: '\x1b[2J\x1b[H\x1b[32mready\x1b[0m\r\nλ 日本語 ✓',
    theme: { background: '#101115', foreground: '#F5F7FA', cursor: '#5B7CFA' } };
  const send = value => page.evaluate(value => document.querySelector('iframe').contentWindow.postMessage(JSON.stringify(value), '*'), value);
  await send(state);
  const frame = page.frames()[1];
  await frame.waitForFunction(() => document.body.textContent.includes('日本語'));
  assert.match(await frame.locator('body').innerText(), /ready/);
  await frame.locator('textarea').focus();
  await page.keyboard.type('ignored');
  assert.equal(await page.evaluate(() => window.notices.filter(item => item.type === 'input').length), 0);
  await send({ ...state, disabled: false });
  await page.waitForFunction(() => window.notices.some(item => item.type === 'resize'));
  await frame.locator('textarea').focus();
  await page.keyboard.type('hello');
  await page.waitForFunction(() => window.notices.filter(item => item.type === 'input').map(item => item.data).join('').includes('hello'));
  await send({ ...state, disabled: false, output: state.output + '\r\nresumed' });
  await frame.waitForFunction(() => document.body.textContent.includes('resumed'));
  assert.equal((await frame.locator('body').innerText()).match(/ready/g)?.length, 1);
  await send({ ...state, output: 'replacement snapshot' });
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
  // Not "as many columns as possible" any more: the type size is chosen for
  // reading, and the column count follows. The computer is told the result, so
  // a narrower grid is correct rather than something to compensate for.
  assert.ok(fit.cols >= 40, `a 390px phone terminal must stay usable, got ${fit.cols} columns`);
  // Pinching changes how many columns the terminal has, not how much of a
  // fixed grid is visible. Drawing the computer's full width and panning over
  // it is iSH's behaviour, and reading should never need horizontal motion.
  // The column count that matters is the one reported to the computer, because
  // that is the number the program lays its output out for.
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

  // A larger type size must buy fewer columns and tell the computer so.
  await frame.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({ target: 'vibyra-terminal', type: 'state', disabled: true, fontSize: 18,
      output: 'resized', theme: { background: '#101115', foreground: '#F5F7FA' } }),
  })));
  await frame.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.xterm-rows')).fontSize) >= 17);
  const after = await grid();
  assert.ok(after.cols < before.cols,
    `bigger type must mean fewer columns: ${before.cols} -> ${after.cols}`);
  assert.ok(after.overflow <= 1, 'a larger type size must still not scroll sideways');
  assert.ok(Number.isInteger(after.cols),
    'the computer must be told the new column count, or it lays out for the old one');

  assert.deepEqual(errors, []);
  console.log(`PASS: bundled terminal, ANSI/Unicode, observing blocks input, control/resize, append and replacement snapshots.`);
  console.log(`PASS: ${fit.cols}x${fit.rows} on a ${fit.width}px phone, whole rows only.`);
  console.log(`PASS: type size drives the grid — ${before.fontSize}px/${before.cols} cols to ${after.fontSize}px/${after.cols} cols, reported and never scrolling sideways.`);
} finally { await browser.close(); }
