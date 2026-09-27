import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-terminal-prompt';
await mkdir(out, { recursive: true });
const bundle = await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['tests/terminalPromptFixture.tsx'], bundle: true, write: false,
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
      for (const state of ['ready', 'observer', 'typing-off']) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${url}/?state=${state}&theme=${theme}`);
        await page.getByText('Do you want to proceed?').first().waitFor();
        await capture(page, `${out}/${size}-${theme}-${state}.png`);
        if (state === 'ready') {
          await page.getByRole('button', { name: 'No', exact: true }).click();
          // One choice per prompt: a second tap waits for the screen to move on.
          await page.getByRole('button', { name: 'Yes', exact: true }).click({ force: true });
          assert.deepEqual(await page.evaluate(() => globalThis.promptKeys), ['3']);
        } else {
          assert.equal(await page.getByRole('button', { name: 'Yes', exact: true }).count(), 0);
          if (state === 'observer') {
            await page.getByRole('button', { name: 'Take control to answer' }).click();
            assert.deepEqual(await page.evaluate(() => globalThis.promptKeys), ['claim']);
          } else await page.getByText('Typing from your phone is off').first().waitFor();
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
      console.log(`PASS ${size}/${theme}: terminal prompt choices, one answer per prompt, blocked reasons.`);
    }
  }
  const codex = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
  await codex.goto(`${url}/?provider=codex`);
  await codex.getByText('Would you like to run the following command?').first().waitFor();
  await codex.getByText(/HKE_ALLOW_LAN=1 npm run start:website/).last().waitFor();
  await capture(codex, `${out}/codex-local-approval.png`);
  await codex.getByRole('button', { name: 'Yes, proceed (y)' }).click();
  assert.deepEqual(await codex.evaluate(() => globalThis.promptKeys), ['y']);
  await codex.close();
  console.log('PASS Codex local command: reason, command, exact approval key.');
} finally {
  await browser?.close();
  server.close();
}
console.log(`Screenshots: ${out}`);
