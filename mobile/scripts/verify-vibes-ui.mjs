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
  alias: { 'react-native': 'react-native-web' }, define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true' },
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
      await page.getByText('3 Vibes', { exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-home.png`);
      // The chip has to land on the balance page. What the page itself then says is
      // `verify-wallet-ui.mjs`, so the AI home and the wallet cannot break together.
      await page.getByRole('button', { name: 'Open Vibes balance' }).click();
      await page.getByRole('heading', { name: 'Your Vibes', exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-wallet.png`);
      await page.getByRole('button', { name: 'Back to chat' }).click();
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
    await page.goto(`${url}/?state=${state}&purchase=${state}`); await page.getByText('3 Vibes', { exact: true }).waitFor();
    if (state === 'consent') {
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), []);
      await capture(page, `${out}/consent.png`); await page.getByRole('button', { name: 'Allow AI processing' }).click();
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
  for (const decision of ['allow', 'decline', 'offline']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${url}/?state=${decision === 'offline' ? 'offline' : 'edit'}`);
    await page.getByText('3 Vibes', { exact: true }).waitFor();
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
