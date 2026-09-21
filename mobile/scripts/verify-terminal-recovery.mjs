import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const out = resolve('../output/terminal-recovery'); await mkdir(out,{recursive:true});
const bundle = await build({entryPoints:['../desktop-tauri/tests/sharedChatsFixture.tsx'],plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}],bundle:true,write:false,outfile:'/tmp/recovery.js',format:'iife',jsx:'automatic',loader:{'.woff2':'dataurl','.png':'dataurl','.webp':'dataurl'}});
const server=createServer((req,res)=>{const file=bundle.outputFiles.find(f=>req.url==='/fixture.js'?f.path.endsWith('.js'):req.url==='/fixture.css'?f.path.endsWith('.css'):false);res.setHeader('Content-Type',file?(req.url.endsWith('.js')?'text/javascript':'text/css'):'text/html');res.end(file?.text??'<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const theme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?resume&${theme}`);
  const saved=page.locator('#conversation-shared-one');
  const native=page.locator('#cli-shared-one');
  for (let restart=0;restart<2;restart++) {
   await native.getByRole('button',{name:'Resume Codex',exact:true}).waitFor();
   assert.equal(await saved.isVisible(),false,'saved terminal must respect Terminal preference');
   await page.reload();
  }
  await native.getByRole('button',{name:'View saved chat',exact:true}).click();
  await saved.getByText('Make this feel clear and comfortable on my iPhone.',{exact:true}).waitFor();
  await saved.getByRole('textbox',{name:'Message Codex'}).fill('Keep my saved draft');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('radiogroup',{name:'Agent view',exact:true}).getByRole('radio',{name:'Terminal',exact:true}).click();
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await native.getByRole('button',{name:'Resume Codex',exact:true}).click();
  await native.getByRole('alert').filter({hasText:'temporarily unavailable'}).waitFor();
  assert.equal(await native.isVisible(),true,'failed resume retains selected view');
  await page.screenshot({path:out+`/saved-${theme}.png`});
  await native.getByRole('button',{name:'Resume Codex',exact:true}).click();
  await native.locator('.xterm-helper-textarea').waitFor({state:'attached'});
  assert.equal(await saved.locator('textarea').inputValue(),'Keep my saved draft');
  assert.equal(await page.evaluate(()=>document.body.dataset.resumedId),'shared-one');
  assert.equal(await page.evaluate(()=>document.body.dataset.resumes),'2');
  assert.equal(await page.evaluate(()=>document.body.dataset.submissions??'0'),'0','resume must never submit a draft');
  await page.screenshot({path:out+`/resumed-${theme}.png`});assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS saved Codex history, failed resume, exact retry, no prompt submission and terminal restoration in both themes.');
} finally {await browser.close();server.close();}
