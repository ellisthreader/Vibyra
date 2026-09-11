import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture, fullyVisible, until } from './ui-test-helpers.mjs';
import { check } from './verify-discovery-states.mjs';

const root = new URL('..', import.meta.url);
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-discovery-screenshots';
await mkdir(out, { recursive: true });
const bundle = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['tests/discoveryBrowserFixture.tsx'], bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  alias: { 'react-native': 'react-native-web' },
  // react-native-web's Dimensions reads `global`, which Metro provides but a
  // plain browser bundle does not.
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true',
    global: 'globalThis' },
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'scripted-discovery', setup(builder) {
    // The native Bonjour module cannot load in a browser, so the hook gets a
    // scripted adapter. Every component under test stays the real one.
    builder.onResolve({ filter: /^\.\/localDiscovery$/ },
      () => ({ path: fileURLToPath(new URL('tests/localDiscoveryFixture.ts', root)) }));
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
const url = `http://127.0.0.1:${server.address().port}`;
const states = ['searching', 'sweep', 'simulator', 'retry', 'swept', 'cellular', 'one', 'many', 'empty', 'denied',
  'failed', 'unavailable', 'handshake', 'approval', 'connected', 'refused'];
// The search screen offers no code route at all; a code is reachable only from
// the setup page before it. Every state is checked for that.
const CODE_ROUTES = ['Use pairing code', 'Connect with a code instead', 'I have a pairing code'];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  for (const [size, width, height, motion] of [['compact', 375, 667, 'reduce'],
    ['iphone', 402, 874, 'no-preference'], ['wide', 1024, 900, 'reduce']]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion,
        colorScheme: theme });
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
      const button = name => page.getByRole('button', { name, exact: true });
      for (const state of states) {
        await page.goto(`${url}/?state=${state}&theme=${theme}`);
        await page.getByText('Nearby computer fixture', { exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        for (const route of CODE_ROUTES) {
          assert.equal(await button(route).count(), 0, `${state} must not offer "${route}"`);
        }
        await check(page, state, button);
        // The shared staggered entrance runs for about 800ms; capture after it
        // settles so a screenshot shows the finished screen, not a fade. Reset
        // any scrolling a check caused so the shot starts at the title.
        await page.waitForTimeout(950);
        await page.evaluate(() => document.querySelectorAll('div').forEach(node => { node.scrollTop = 0; }));
        await capture(page, `${out}/${size}-${theme}-${state}.png`);
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${size}/${theme}: auto search, handoff, choice, blocked access and live connection stages.`);
    }
  }
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
