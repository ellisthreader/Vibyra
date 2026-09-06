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
  assert.deepEqual(errors, []);
  console.log('PASS: bundled terminal, ANSI/Unicode, observing blocks input, control/resize, append and replacement snapshots.');
} finally { await browser.close(); }
