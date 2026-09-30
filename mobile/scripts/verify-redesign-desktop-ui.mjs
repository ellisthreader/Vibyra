import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const bundle = await build({ entryPoints: [resolve('../desktop-tauri/tests/sharedChatsFixture.tsx')], plugins: [{ name: 'fixture-artwork', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }], bundle: true, write: false, outfile: '/tmp/fixture.js', format: 'iife', jsx: 'automatic', loader: { '.woff2': 'dataurl', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' } });
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text, css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/fixture.css' ? 'text/css' : 'text/html'); res.end(req.url === '/fixture.js' ? js : req.url === '/fixture.css' ? css : '<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:100%;margin:0}body{font-family:Inter,system-ui;background:var(--bg)}</style><div id="root"></div><script src="/fixture.js"></script>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
 for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?redesign=1${theme === 'light' ? '&light=1' : ''}`);
  const pane = page.getByRole('region', { name: 'Build the iPhone experience terminal' });
  await pane.getByRole('button', { name: 'Expand terminal', exact: true }).click();
  await page.getByText('4 recorded steps', { exact: true }).click();
  await page.getByRole('button',{name:/Reading files/}).click();
  const samples = await page.evaluate(async () => {
   const times = []; const button = document.querySelector('.activity-step-heading');
   for(let i=0;i<30;i++) { const start=performance.now(); button.click(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); times.push(performance.now()-start); }
   return times.sort((a,b)=>a-b);
  });
  console.log(`${theme} disclosure-to-paint p95 ${samples[Math.ceil(samples.length*.95)-1].toFixed(1)}ms (headless Chrome, local design fixture)`);
  assert.ok(samples[Math.ceil(samples.length*.95)-1] < 100);

  await page.screenshot({ path: `/tmp/vibyra-redesign-desktop-${theme}.png` });
  await page.getByRole('button', { name: 'Changes 1', exact: true }).click();
  await page.getByRole('button', { name: /src\/connection.ts/ }).click();
  await page.getByText('+  preserveConversation(session.id);', { exact: true }).waitFor();
  await page.screenshot({ path: `/tmp/vibyra-redesign-desktop-${theme}-diff.png` });
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  assert.equal(await page.locator('.diff-split-row').count(), 6);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open commands', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('/usage');
  await page.getByRole('button', { name: /^\/usage / }).click();
  await page.getByText('32% used', { exact: true }).waitFor();
  await page.screenshot({ path: `/tmp/vibyra-redesign-desktop-${theme}-usage.png` });
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('/effort');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'low', exact: true }).click();
  await page.getByRole('button', { name: 'Apply for next turn', exact: true }).click();
  await pane.getByRole('button', { name: 'Thinking effort', exact: true }).filter({ hasText: 'low' }).waitFor();
  for (const [width,height] of [[1100,760],[800,620]]) {
   await page.setViewportSize({width,height});
   await page.getByRole('button', { name: 'Changes 1', exact: true }).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`/tmp/vibyra-redesign-desktop-${theme}-${width}.png`});
   await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]); await page.close();
 }
 console.log('PASS Desktop redesign: rich prose, stable disclosures, attributed unified/split diff, usage, command dispatch, effective effort, themes and responsive inspector');
} finally { await browser.close(); server.close(); }
