import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';

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
      await page.getByText('100 Vibes', { exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-home.png`);
      await page.getByRole('button', { name: 'Open Vibes balance' }).click();
      await page.getByText('£20.00 / month', { exact: true }).waitFor();
      // Three upgrade offers for a free account, middle one selected by default.
      assert.equal(await page.getByRole('radio').count(), 3, 'Free accounts are offered every paid plan');
      await page.getByRole('radio', { name: 'Builder, 1000 Vibes per month', checked: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-wallet.png`);
      await page.getByRole('radio', { name: 'Pro, 2000 Vibes per month' }).click();
      // Every benefit below is a backend entitlement, not fixed marketing copy.
      for (const benefit of ['2,000 Vibes every month', 'Every model on OpenRouter', 'Unlimited projects',
        '3 replies at once', 'Remote access to your computer']) await page.getByText(benefit, { exact: true }).waitFor();
      // Remote access is sold but not yet switched on, so it must not read as ready.
      await page.getByText('Coming soon', { exact: true }).waitFor();
      const buy = page.getByRole('button', { name: 'Continue · £99.00 / month', exact: true });
      await buy.scrollIntoViewIfNeeded();
      const bounds = await buy.boundingBox(); assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
      await capture(page, `${out}/${size}-${theme}-upgrade.png`);
      await buy.click();
      await page.getByText('Your Vibes are ready. Return to your chat whenever you like.').waitFor();
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['buy', 'verify', 'finish']);
      // The top plan stops selling itself and offers top-ups instead.
      await page.getByText('Your plan includes', { exact: true }).waitFor();
      assert.equal(await page.getByRole('radio').count(), 0, 'The highest plan shows no further offer');
      await page.getByRole('button', { name: 'Add 500 Vibes · £20.00', exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-current-plan.png`);
      await page.getByRole('button', { name: 'Close Your Vibes' }).click();
      await page.getByRole('button', { name: 'Choose AI model' }).click();
      // Companies are collapsed, so Auto is the only choice on screen until one opens.
      assert.equal(await page.getByRole('radio').count(), 1);
      for (const company of ['OpenAI', 'Anthropic', 'Google', 'xAI'])
        await page.getByRole('button', { name: company, exact: true }).waitFor();
      await capture(page, `${out}/${size}-${theme}-models.png`);
      await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'OpenAI', exact: true }).getAttribute('aria-expanded'), 'true');
      await capture(page, `${out}/${size}-${theme}-models-open.png`);
      await page.getByRole('textbox', { name: 'Search AI models' }).fill('grok');
      assert.equal(await page.getByRole('radio').count(), 1, 'Search narrows the catalogue and opens the match');
      await page.getByRole('textbox', { name: 'Search AI models' }).fill('');
      await page.getByRole('radio', { name: 'OpenAI GPT-5.6 Luna' }).click();
      await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Help me design a simple welcome screen.');
      await page.getByText('This reply uses up to 5 Vibes', { exact: true }).waitFor();
      await page.setViewportSize({ width, height: 430 });
      await page.getByRole('heading', { name: 'Let’s build something.', exact: true }).waitFor();
      const send = page.getByRole('button', { name: 'Send message' });
      const box = await send.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 430);
      await capture(page, `${out}/${size}-${theme}-keyboard-space.png`);
      await send.click(); await page.getByText('2 Vibes used', { exact: true }).waitFor();
      await page.setViewportSize({ width, height });
      await capture(page, `${out}/${size}-${theme}-reply.png`);
      assert.equal(await page.getByRole('textbox', { name: 'Message Vibyra AI' }).inputValue(), '');
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: wallet, purchase verification order, models, reply and compact keyboard space.`);
    }
  }
  // The balance also lives in the navigation rail, so it is reachable from every
  // screen and not only from the AI home.
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?rail=drawer&theme=${theme}`);
    const row = page.getByRole('button', { name: '100 Vibes, Free plan' });
    await row.waitFor();
    // It has to sit with the rail's own rows, not tower over them.
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    const [a, b] = [await row.boundingBox(), await settings.boundingBox()];
    assert.ok(a && b && a.height >= 44, 'the rail balance is a real tap target');
    assert.ok(a.y < b.y, 'the balance sits above Settings');
    assert.ok(Math.abs(a.x - b.x) < 1, 'left edges align with the rail rows');
    assert.ok(a.height <= b.height, 'it is no taller than the Settings row');
    await row.click();
    await page.getByRole('heading', { name: 'Your Vibes', exact: true }).waitFor();
    await page.getByText('£20.00 / month', { exact: true }).waitFor();
    await capture(page, `${out}/${theme}-rail-balance.png`);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS rail/${theme}: the balance row sits in the rail and opens the upgrade screen.`);
  }
  for (const state of ['consent', 'failure', 'cancel']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(`${url}/?state=${state}&purchase=${state}`); await page.getByText('100 Vibes', { exact: true }).waitFor();
    if (state === 'consent') {
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), []);
      await capture(page, `${out}/consent.png`); await page.getByRole('button', { name: 'Allow AI processing' }).click();
      await page.getByRole('button', { name: 'Attach a project' }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['consent']);
    } else if (state === 'cancel') {
      await page.getByRole('button', { name: 'Open Vibes balance' }).click();
      await page.getByRole('button', { name: 'Continue · £49.00 / month' }).click();
      await page.waitForTimeout(400); assert.deepEqual(await page.evaluate(() => window.vibesCalls), ['buy']);
    } else {
      const input = page.getByRole('textbox', { name: 'Message Vibyra AI' }); await input.fill('Keep my draft after a failed send.');
      await page.getByText('This reply uses up to 5 Vibes', { exact: true }).waitFor();
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
    await page.getByText('100 Vibes', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Create a welcome message.');
    await page.getByText('This reply uses up to 5 Vibes', { exact: true }).waitFor();
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
