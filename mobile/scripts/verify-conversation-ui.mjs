import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-conversation-screenshots';
await mkdir(out, { recursive: true });
const bundle = await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['tests/conversationBrowserFixture.tsx'], bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  alias: { 'react-native': 'react-native-web' },
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true' },
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'browser-font-server-context', setup(builder) {
    // Expo imports this Node-only context even in the browser font module.
    builder.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async-hooks', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: 'export class AsyncLocalStorage { getStore() { return undefined; } }',
    }));
  } }],
});
const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}</style>'
  + '<div id="root"></div><script src="/fixture.js"></script>';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const url = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
      for (const state of ['idle', 'working', 'permission', 'question', 'denied', 'completed', 'error', 'offline', 'observer']) {
        await page.goto(`${url}/?state=${state}&theme=${theme}`);
        await page.getByText('Conversation design fixture', { exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (state === 'permission') {
          const allow = page.getByRole('button', { name: 'Allow once', exact: true });
          const decline = page.getByRole('button', { name: 'Decline', exact: true });
          await allow.scrollIntoViewIfNeeded();
          for (const target of [allow, decline]) {
            const bounds = await target.boundingBox();
            assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44, 'Permission touch targets meet 44pt minimum');
          }
          assert.equal(await page.evaluate(() => window.conversationCalls.length), 0);
          const details = page.getByRole('button', { name: 'Action details', exact: true });
          await details.click();
          await page.getByText('npm run test -- welcome', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.conversationCalls.length), 0, 'Inspecting an action must not approve it');
          await details.click();
          await allow.scrollIntoViewIfNeeded();
          await capture(page, `${out}/${size}-${theme}-${state}.png`);
          await allow.click();
          assert.deepEqual(await page.evaluate(() => window.conversationCalls), [{ id: 'permission', response: 'accept' }]);
        } else if (state === 'question') {
          const option = page.getByRole('radio', { name: /Calm and minimal/ });
          await option.click();
          assert.equal(await page.evaluate(() => window.conversationCalls.length), 0, 'Selecting an option must not submit');
          await capture(page, `${out}/${size}-${theme}-${state}.png`);
          await page.getByRole('button', { name: 'Send answer', exact: true }).click();
          assert.deepEqual(await page.evaluate(() => window.conversationCalls), [{ id: 'question', response: { style: ['calm'] } }]);
        } else {
          await capture(page, `${out}/${size}-${theme}-${state}.png`);
          if (state === 'offline' || state === 'observer') {
            for (const name of ['Allow once', 'Decline']) {
              const button = page.getByRole('button', { name, exact: true });
              if (await button.count()) assert.equal(await button.getAttribute('aria-disabled'), 'true');
            }
            assert.equal(await page.evaluate(() => window.conversationCalls.length), 0);
          }
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${theme}: conversation states, explicit decisions, deliberate questions and disabled observers.`);
    }
  }
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
