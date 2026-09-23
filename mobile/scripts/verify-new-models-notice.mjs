import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';

const output = resolve('../output/new-models-notice');
await mkdir(output, { recursive:true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)]
  .map(match => `import ${JSON.stringify(resolve('../desktop-tauri/src', match[1]))};`).join('\n');
const bundle = await build({
  stdin:{ contents:`${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/newModelsNoticeFixture.tsx'))};`, resolveDir:process.cwd() },
  bundle:true, write:false, outfile:'/tmp/vibyra-new-models-notice.js', format:'iife', jsx:'automatic',
  loader:{ '.png':'dataurl', '.webp':'dataurl', '.woff2':'dataurl', '.ttf':'dataurl' },
  plugins:[{ name:'art', setup(builder) { builder.onLoad({filter:/\/modelArtwork\.ts$/}, () => ({contents:'export const modelArtworkUrl = () => null;',loader:'ts'})); } }],
});
await Promise.all(bundle.outputFiles.map(file => writeFile(`${output}/${file.path.endsWith('.js') ? 'fixture.js' : 'fixture.css'}`, file.contents)));
const server = createServer((request,response) => {
  const file = bundle.outputFiles.find(item => request.url === '/fixture.js' ? item.path.endsWith('.js') : request.url === '/fixture.css' ? item.path.endsWith('.css') : false);
  response.setHeader('Content-Type', file ? request.url.endsWith('.js') ? 'application/javascript' : 'text/css' : 'text/html');
  response.end(file?.text ?? '<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolveReady => server.listen(0,'127.0.0.1',resolveReady));
const browser = process.env.VIBYRA_TEST_WEBKIT
  ? await webkit.launch({headless:true})
  : await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1586,height:992},deviceScaleFactor:1});
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  const modal = page.getByRole('dialog',{name:/More intelligence/});
  await modal.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const box = await modal.boundingBox();
  assert.ok(Math.abs(box.width-1004)<2 && Math.abs(box.height-827)<2, JSON.stringify(box));
  assert.ok(Math.abs(box.x-291)<2 && Math.abs(box.y-82.5)<2, JSON.stringify(box));
  assert.equal(await modal.getByText('Claude Opus 5.5').count(),1);
  assert.equal(await modal.getByText('Smarter. Faster. More capable.').count(),0);
  assert.equal(await modal.getByText('More capable. More controllable. More useful.').count(),0);
  assert.equal(await modal.getByText('Intelligence at its finest.').count(),1);
  assert.equal(await modal.getByRole('checkbox').isChecked(),true);
  await page.screenshot({path:`${output}/modal-1586${process.env.VIBYRA_TEST_WEBKIT ? '-webkit' : ''}.png`});
  await page.setViewportSize({width:960,height:720});
  const compact = await modal.boundingBox();
  assert.ok(compact.x >= 20 && compact.y >= 20 && compact.x+compact.width <= 940 && compact.y+compact.height <= 700);
  assert.ok(await modal.getByRole('button',{name:/Start using the new models/}).isVisible());
  await page.setViewportSize({width:1586,height:992});
  await modal.getByRole('checkbox').uncheck();
  await modal.getByRole('button',{name:'Maybe later'}).click();
  assert.equal(await modal.count(),0);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('vibyra.desktop.modelNotice.'))),[]);
  await page.reload();
  await page.getByRole('button',{name:/Start using the new models/}).click();
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('vibyra.desktop.modelNotice.') && localStorage.getItem(key) === 'true').length),1);
  assert.equal(await page.evaluate(() => window.projectView()),'new-project');
  await page.reload();
  assert.equal(await page.getByRole('dialog',{name:/More intelligence/}).count(),0);
  assert.deepEqual(errors,[]);
  console.log(`PASS new models notice (${process.env.VIBYRA_TEST_WEBKIT ? 'WebKit' : 'Chromium'}): ${JSON.stringify(box)}`);
  await page.close();
} finally { await browser.close(); server.close(); }
