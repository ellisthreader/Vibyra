import { build } from 'esbuild';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';

// Exercises the production scroll hook after older history arrives asynchronously.
const source = `import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useRequestedRunScroll} from './src/components/teammates/useRequestedRunScroll';
import {useTeammateFocus} from './src/state/teammateFocusStore';
function Fixture(){const output=useRef(null),follow=useRef(true);const[old,setOld]=useState(false);
 const turns=[...(old?[{id:'old'}]:[]),...Array.from({length:20},(_,i)=>({id:'new-'+i}))];
 useRequestedRunScroll('agent',true,turns,output,follow);
 window.fixture={request:()=>useTeammateFocus.getState().request('agent','old'),load:()=>setOld(true),follow:()=>follow.current};
 return <div ref={output} style={{height:200,overflow:'auto'}}>{turns.map(t=><article data-run-id={t.id} key={t.id} style={{height:100}}>{t.id}</article>)}</div>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const bundled = await build({ stdin: { contents: source, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? bundled.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const kind of ['chromium', 'webkit']) {
    const browser = kind === 'webkit' ? await webkit.launch()
      : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => window.fixture);
      await page.locator('#root > div').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.evaluate(() => window.fixture.request());
      await page.evaluate(() => window.fixture.load());
      await page.waitForFunction(() => document.querySelector('#root > div').scrollTop === 0);
      assert.equal(await page.evaluate(() => window.fixture.follow()), false);
      await page.locator('#root > div').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.evaluate(() => window.fixture.request());
      await page.waitForFunction(() => document.querySelector('#root > div').scrollTop === 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${kind}: delayed historical task and repeated notification focus`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
