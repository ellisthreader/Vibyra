import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture, fullyVisible, until } from './ui-test-helpers.mjs';

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
const states = ['searching', 'cellular', 'one', 'many', 'empty', 'denied', 'failed', 'unavailable',
  'handshake', 'approval', 'connected', 'refused'];
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

async function check(page, state, button) {
  const calls = () => page.evaluate(() => window.discoveryCalls);
  const text = value => page.getByText(value, { exact: true }).first().waitFor();
  // The title is one two-line heading with an accented second line, so it is
  // read whole rather than matched line by line.
  // A scripted state can arrive a beat after the screen mounts, so the heading
  // is awaited rather than sampled once.
  const heading = async expected => {
    const header = page.getByRole('heading').first();
    await header.waitFor();
    const read = () => header.innerText().then(value => value.replace(/\s+/g, ' ').trim());
    await until(async () => (await read()) === expected, `heading "${expected}" for ${state}`, 8000);
  };
  if (state === 'searching') {
    await heading('Searching your networks');
    // Every link is named and shown live, so the search reads as covering all
    // of them at once rather than one Wi-Fi.
    for (const link of ['Wi-Fi', 'Direct', 'VPN', 'Cellular']) await text(link);
    await page.getByText('Listening on Wi-Fi, Direct and VPN at the same time. Nothing to type.',
      { exact: true }).waitFor();
    assert.equal(await button('Search again').count(), 0, 'A live search offers no restart');
    assert.deepEqual(await calls(), [], 'Searching selects nothing on its own');
  } else if (state === 'cellular') {
    // Cellular cannot carry multicast discovery, so it is never implied.
    await text('No searchable network');
    await page.getByText(/None of your current networks can be searched/).waitFor();
  } else if (state === 'one') {
    await heading('Found Ellis’s Studio');
    await page.getByText('Reached over Wi-Fi. Starting the encrypted connection…', { exact: true }).waitFor();
    await page.waitForFunction(() => window.discoveryCalls.includes('select:Ellis’s Studio'), null,
      { timeout: 4000 });
  } else if (state === 'many') {
    await heading('Choose your computer');
    await page.getByText('4 computers answered on your networks.', { exact: true }).waitFor();
    // Each card names the link it answered on.
    for (const tag of ['WI-FI', 'VPN', 'DIRECT']) await text(tag);
    // A computer that has not resolved yet stays announced but unusable, so it
    // is described rather than hidden and a tap cannot start a dead connection.
    const arriving = page.getByRole('button', { name: /Living room mini, still announcing its address/ });
    assert.equal(await arriving.getAttribute('aria-disabled'), 'true');
    await page.getByText('Announcing its address…', { exact: true }).waitFor();
    // A Host that resolved without an identity is named as too old, not stuck.
    const older = page.getByRole('button', { name: /Attic tower needs a newer Vibyra Host/ });
    assert.equal(await older.getAttribute('aria-disabled'), 'true');
    await page.getByText('Needs a newer Vibyra Host', { exact: true }).waitFor();
    await arriving.click({ force: true });
    await older.click({ force: true });
    await page.waitForTimeout(1600);
    assert.deepEqual(await calls(), [], 'Several computers never auto-connect, resolved or not');
    await page.getByRole('button', { name: /Connect to Workshop MacBook Pro at 192\.168\.1\.31:4318/ }).click();
    assert.deepEqual(await calls(), ['select:Workshop MacBook Pro']);
  } else if (state === 'empty' || state === 'failed') {
    await heading(state === 'empty' ? 'Nothing answered' : 'The search stopped');
    await fullyVisible(button('Search again'), page, 'Restart after a quiet search');
  } else if (state === 'denied') {
    await heading('Local network is off');
    await fullyVisible(button('Open Settings'), page, 'Settings route');
  } else if (state === 'unavailable') {
    await heading('Searching needs the app');
    for (const absent of ['Wi-Fi', 'Direct', 'listening for Vibyra Host']) {
      assert.equal(await page.getByText(absent, { exact: false }).count(), 0,
        `A client without the native module must not imply searching: ${absent}`);
    }
  } else {
    assert.deepEqual(await calls(), ['connect:ws://192.168.1.24:4318'], 'The resolved address is used verbatim');
    const address = page.getByText('192.168.1.24:4318', { exact: true });
    await address.waitFor();
    assert.equal(await address.count(), 1, 'The resolved address is stated once, on the pinned computer');
    assert.equal(await page.getByRole('button', { name: /Ellis’s Studio/ }).count(), 0,
      'The computer being connected to is pinned, not offered for selection again');
    if (state === 'handshake') await text('Connecting to Ellis’s Studio');
    if (state === 'approval') {
      await text('Approve this iPhone');
      await text('Approved on Ellis’s Studio');
      await fullyVisible(button('Cancel'), page, 'Cancelling a pending approval');
    }
    if (state === 'connected') {
      await text('Connected');
      await page.waitForFunction(() => window.discoveryCalls.includes('done'), null, { timeout: 4000 });
    }
    if (state === 'refused') {
      await text('Could not connect');
      await page.getByText('Pairing denied or expired', { exact: true }).waitFor();
      await fullyVisible(button('Try again'), page, 'Retry after refusal');
    }
  }
}
