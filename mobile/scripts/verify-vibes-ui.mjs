import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { checkEffort, checkPicker } from './verify-vibes-picker.mjs';

const out = '/tmp/vibyra-vibes-screenshots'; await mkdir(out, { recursive: true });
const bundle = await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['tests/vibesBrowserFixture.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  // `expo` itself starts Metro's hot-reload client; the pickers only need the core.
  alias: { 'react-native': 'react-native-web', expo: 'expo-modules-core' }, define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true', global: 'globalThis' },
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'font-server-context', setup(b) {
    b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async-hooks', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class AsyncLocalStorage { getStore() { return undefined; } }' }));
  } }],
});
const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}</style><div id="root"></div><script src="/fixture.js"></script>';
const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${url}/?theme=${theme}`);
      await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
      // The chat shows no balance: it lives in the rail and in Settings, which
      // `verify-wallet-ui.mjs` covers, so the chat and the wallet cannot break together.
      assert.equal(await page.getByText(/\bVibes?\b/).count(), 0, 'No Vibes on the chat page before anything is typed');
      await capture(page, `${out}/${size}-${theme}-home.png`);
      await checkPicker(page, capture, out, `${size}-${theme}`);
      await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Help me design a simple welcome screen.');
      await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();

      await checkEffort(page, capture, out, `${size}-${theme}`);
      await page.setViewportSize({ width, height: 430 });
      await page.getByRole('heading', { name: 'Let’s build something.', exact: true }).waitFor();
      const send = page.getByRole('button', { name: 'Send message' });
      const box = await send.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 430);
      await capture(page, `${out}/${size}-${theme}-keyboard-space.png`);
      // The charge is the fixture's own (`charged: 1`), not the quote's ceiling: what
      // a reply reserves and what it costs are different numbers, and the transcript
      // shows the one that was actually taken.
      await send.click(); await page.getByText('1 Vibe used', { exact: true }).waitFor();
      // Proof the level reached the request, not merely the label.
      assert.ok((await page.evaluate(() => window.vibesEfforts)).includes('submit:max'),
        'The effort that was chosen is the effort that was sent');
      await page.setViewportSize({ width, height });
      await capture(page, `${out}/${size}-${theme}-reply.png`);
      assert.equal(await page.getByRole('textbox', { name: 'Message Vibyra AI' }).inputValue(), '');
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: wallet, purchase verification order, models, reply and compact keyboard space.`);
    }
  }
  for (const state of ['consent', 'failure']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(`${url}/?state=${state}&purchase=${state}`); await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    if (state === 'consent') {
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), []);
      await capture(page, `${out}/consent.png`); await page.getByRole('button', { name: 'Allow AI processing' }).click();
      // A project is one of the things the composer's + adds.
      await page.getByRole('button', { name: 'Add to chat' }).click();
      await page.getByRole('button', { name: 'Attach a project' }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['consent']);
    } else {
      const input = page.getByRole('textbox', { name: 'Message Vibyra AI' }); await input.fill('Keep my draft after a failed send.');
      await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Send message' }).click();
      await page.getByText('Connection interrupted. Your draft is saved.', { exact: true }).waitFor();
      assert.equal(await input.inputValue(), 'Keep my draft after a failed send.');
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['submit']);
    }
    await page.close(); console.log(`PASS ${state}`);
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(`${url}/?account=guest&state=consent`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('Build a timer as a guest.');
    assert.equal(await input.inputValue(), 'Build a timer as a guest.');
    assert.equal(await page.getByText(/Verify your email/).count(), 0, 'a guest is not email-gated');
    await page.getByRole('button', { name: 'Allow AI processing' }).click();
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('1 Vibe used', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['guest', 'consent', 'submit']);
    await page.close(); console.log('PASS guest chat');
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/?account=guest&state=route-missing`);
    await page.getByText('Vibyra AI is not available on this server yet.', { exact: true }).waitFor();
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('Keep this draft until the route is ready.');
    assert.equal(await input.inputValue(), 'Keep this draft until the route is ready.');
    assert.equal(await page.getByRole('button', { name: 'Send message' }).getAttribute('aria-disabled'), 'true');
    await page.getByText('Refresh', { exact: true }).click();
    assert.deepEqual(errors, [], 'retrying an unavailable guest route must not reject outside the store');
    await capture(page, `${out}/guest-route-missing.png`);
    await page.close(); console.log('PASS missing route keeps guest draft editable');
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(`${url}/?account=guest&state=route-retry`);
    await page.getByText('Vibyra AI is not available on this server yet.', { exact: true }).waitFor();
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('Retry without losing me.');
    await page.getByText('Refresh', { exact: true }).click();
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'Retry without losing me.');
    assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['guest', 'guest']);
    await page.close(); console.log('PASS guest route retry preserves draft');
  }
  for (const decision of ['allow', 'decline', 'offline']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${url}/?state=${decision === 'offline' ? 'offline' : 'edit'}`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Create a welcome message.');
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Send message' }).click();
    const allow = page.getByRole('button', { name: 'Allow this edit', exact: true });
    const decline = page.getByRole('button', { name: 'Decline', exact: true });
    await allow.scrollIntoViewIfNeeded();
    assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['submit'], 'Viewing a file edit never approves it');
    await capture(page, `${out}/project-${decision}.png`);
    if (decision === 'offline') {
      assert.equal(await allow.getAttribute('aria-disabled'), 'true');
      assert.equal(await decline.getAttribute('aria-disabled'), 'true');
    } else {
      await (decision === 'allow' ? allow : decline).click();
      await page.getByText(decision === 'allow' ? 'The file is saved.' : 'I left your file unchanged.', { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['submit', decision, 'result']);
    }
    await page.close(); console.log(`PASS project ${decision}`);
  }
  console.log(`Screenshots: ${out}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
