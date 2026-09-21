import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

const root = new URL('..', import.meta.url);
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-handoff';
await mkdir(out, { recursive: true });
const bundle = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['tests/connectionHandoffBrowserFixture.tsx'], bundle: true, write: false,
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
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [width,height,motion] of [[375,667,'reduce'],[402,874,'no-preference'],[1024,900,'no-preference']]) for(const theme of ['dark','light']) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${url}/?state=one&theme=${theme}`);
  await page.getByRole('button',{name:'I’ve installed it',exact:true}).click();
  const yes=page.getByRole('button',{name:'Yes, connect',exact:true});await yes.waitFor();
  await page.waitForTimeout(1500);
  await capture(page,`${out}/${width}-${theme}-found.png`);
  await yes.click();
  if(motion==='no-preference') {
    const overlay=page.getByTestId('connection-handoff');await overlay.waitFor();
    const before=await overlay.boundingBox();
    assert.ok(before && before.width>150, 'the found laptop remains visible through the handoff');
    await overlay.waitFor({state:'detached'});
  }
  await page.getByRole('heading',{name:'Approve this iPhone',exact:true}).waitFor();
  await page.waitForTimeout(2000);
  await fullyVisible(page.getByRole('button',{name:'Cancel',exact:true}),page,'cancel after handoff');
  await capture(page,`${out}/${width}-${theme}-approval.png`);
  assert.deepEqual(await page.evaluate(()=>window.handoffCalls),['connect']);
  await page.evaluate(()=>window.approveHandoff());
  await page.getByRole('heading',{name:'Connected',exact:true}).waitFor();
  await page.waitForFunction(()=>window.handoffCalls.includes('done'));
  assert.ok(!(await page.evaluate(()=>window.handoffCalls)).includes('disconnect'),'successful connection survives transition cleanup');
  assert.deepEqual(errors,[]);console.log(`PASS ${width}/${theme}/${motion}: found → approval → connected`);
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:402,height:874}});
 await page.goto(`${url}/?state=one&theme=dark`);
 await page.getByRole('button',{name:'I’ve installed it',exact:true}).click();
 await page.getByRole('button',{name:'Yes, connect',exact:true}).click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.ok((await page.evaluate(()=>window.handoffCalls)).includes('disconnect'));
 console.log('PASS cancellation during handoff');
 await page.close();
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
