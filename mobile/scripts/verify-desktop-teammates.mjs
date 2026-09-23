import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const out = resolve('../output/desktop-agents-completion'); await mkdir(out, {recursive:true});
const bundle = await build({entryPoints:['../desktop-tauri/tests/teammatesFixture.tsx'],bundle:true,write:false,outfile:'/tmp/agents.js',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}]});
const server = createServer((req,res)=>{const file=bundle.outputFiles.find(f=>req.url==='/fixture.js'?f.path.endsWith('.js'):req.url==='/fixture.css'?f.path.endsWith('.css'):false);res.setHeader('Content-Type',file?(req.url.endsWith('.js')?'application/javascript':'text/css'):'text/html');res.end(file?.text??'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')) { console.log(`Fixture: ${url}`); await new Promise(()=>{}); }
const kind = process.env.VIBYRA_TEST_WEBKIT ? 'webkit' : 'chromium';
const browser = kind==='webkit' ? await webkit.launch() : await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const theme of ['dark','light']) {
  const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});const select=name=>page.getByRole('button',{name:new RegExp(name)}).first().click();
  await page.goto(`${url}/?${theme}`); await select('Website reviewer');await page.getByText('Explain the outcome',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/${kind}-${theme}-conversation.png`});const input=page.getByRole('textbox',{name:'Message Website reviewer'});
  await page.getByLabel('Attach file',{exact:true}).setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Test context')});
  await button('Remove notes.txt').waitFor();await input.fill('Temporary');await input.fill('');await select('On-call engineer');await select('Website reviewer');
  await button('Remove notes.txt').waitFor();await page.reload();await button('Remove notes.txt').waitFor();
  await input.fill('Give me a concise summary.');await button('Message options').click();await page.getByLabel('AI model',{exact:true}).selectOption('test/reviewer');await page.getByLabel('Thinking effort',{exact:true}).selectOption('high');
  await input.press('Enter');await button('Send message').waitFor();assert.deepEqual(await page.evaluate(()=>window.fixture.inspect().quoteData.attachments),['123e4567-e89b-42d3-a456-000000000040']);
  await input.fill('Updated request');assert.equal(await button('Send message').count(),0);await input.press('Enter');await button('Send message').click();await page.getByText('Test reply received. Your message was processed once.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.inspect().posted),1);assert.equal(await input.inputValue(),'');
  await input.fill('Recover an interrupted send');await input.press('Enter');await button('Send message').waitFor();await page.evaluate(()=>window.fixture.outcome('ambiguous'));await button('Send message').click();await button('Check outcome').waitFor();
  await button('Check outcome').click();await page.getByText('Recover an interrupted send',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');assert.equal(await page.evaluate(()=>window.fixture.inspect().posted),2);
  await input.fill('Keep this when credits are insufficient');await input.press('Enter');await button('Send message').waitFor();await page.evaluate(()=>window.fixture.outcome('402'));await button('Send message').click();await page.getByText('402: Insufficient Vibes',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'Keep this when credits are insufficient');assert.equal(await button('Check outcome').count(),0);assert.equal(await input.isEnabled(),true);
  await button('Switch to Code').click();await button('Switch to Agents').click();assert.equal(await input.inputValue(),'Keep this when credits are insufficient');
  await select('On-call engineer');await button('Approve once').waitFor();await page.screenshot({path:`${out}/${kind}-${theme}-approval.png`});
  await page.evaluate(()=>window.fixture.changeDecision());await button('Approve once').click();await page.getByText('This action changed or expired. Review the current details before deciding.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.fixture.inspect().decisions),0);
  await button('Approve once').click();await page.getByText('Approved · waiting to run',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.fixture.inspect().decisions),1);
  await button('Stop task').click();await page.getByText('Task stopped',{exact:true}).waitFor();
  for(const [width,height] of [[900,600],[700,480],[390,700]]) {
   await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width<=700){await button('Back to teammates').click();await page.getByLabel('Search teammates',{exact:true}).fill('Website');await select('Website reviewer');assert.equal(await input.inputValue(),'Keep this when credits are insufficient');await page.waitForFunction(()=>{const el=[...document.querySelectorAll('textarea')].find(el=>el.getClientRects().length);return el&&el.clientHeight>=el.scrollHeight-1;});}
   await page.screenshot({path:`${out}/${kind}-${theme}-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:800});await button('Skills').click();await button('New skill').click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Verification checklist');await page.getByRole('textbox',{name:'Instructions',exact:true}).fill('Check the result twice.');await button('Done').click();await button('Skills').click();assert.equal(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'Verification checklist');await button('Save skill').click();await button('Verification checklist').waitFor();await button('Done').click();
  await page.evaluate(()=>window.fixture.account());await page.getByText('No teammates yet.',{exact:true}).waitFor();assert.equal(await page.getByText('Keep this when credits are insufficient',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 const failure=await browser.newPage({viewport:{width:1280,height:800}});await failure.setViewportSize({width:390,height:700});await failure.goto(`${url}/?offline`);await failure.getByText('Unable to load teammates.',{exact:true}).waitFor();assert.equal(await failure.getByText('Loading teammates…',{exact:true}).count(),0);
 await failure.evaluate(()=>window.fixture.online());await failure.getByRole('button',{name:'Retry',exact:true}).click();await failure.getByRole('button',{name:/Website reviewer/}).click();await failure.setViewportSize({width:1280,height:800});
 await failure.evaluate(()=>window.fixture.historyError(true));await failure.getByRole('button',{name:/On-call engineer/}).click();await failure.getByRole('button',{name:'Retry conversation',exact:true}).waitFor();assert.equal(await failure.getByText('Loading conversation…',{exact:true}).count(),0);
 await failure.evaluate(()=>window.fixture.historyError(false));await failure.getByRole('button',{name:'Retry conversation',exact:true}).click();await failure.getByRole('button',{name:'Approve once',exact:true}).waitFor();await failure.close();
 const resources=await browser.newPage({viewport:{width:1280,height:800}});await resources.goto(`${url}/?wallet-error`);await resources.getByRole('button',{name:/Website reviewer/}).click();await resources.getByText('Account service unavailable.',{exact:true}).waitFor();await resources.evaluate(()=>window.fixture.resourcesReady());await resources.getByRole('button',{name:'Retry conversation',exact:true}).click();await resources.getByRole('textbox',{name:'Message Website reviewer'}).fill('Recovered');assert.equal(await resources.getByRole('button',{name:'Prepare message',exact:true}).isEnabled(),true);await resources.close();
 const models=await browser.newPage({viewport:{width:1280,height:800}});await models.goto(`${url}/?models-error`);await models.getByRole('button',{name:/Website reviewer/}).click();await models.getByText('Model service unavailable.',{exact:true}).waitFor();await models.evaluate(()=>window.fixture.resourcesReady());await models.getByRole('button',{name:'Retry conversation',exact:true}).click();await models.getByRole('button',{name:'Message options',exact:true}).click();await models.getByLabel('AI model',{exact:true}).selectOption('test/reviewer');assert.equal(await models.getByText('Model service unavailable.',{exact:true}).count(),0);await models.close();
 const history=await browser.newPage({viewport:{width:1280,height:800}});await history.goto(`${url}/?history`);await history.getByRole('button',{name:/Website reviewer/}).click();
 await history.getByRole('button',{name:'Load earlier messages',exact:true}).click();await history.getByText('Earlier task 1',{exact:true}).waitFor();assert.equal(await history.locator('.teammate-turn').count(),210);
 await history.locator('.teammate-messages').evaluate(el=>{el.scrollTop=10;el.dispatchEvent(new Event('scroll'));});await history.evaluate(()=>window.fixture.addReply());await history.getByRole('button',{name:'Latest messages ↓',exact:true}).waitFor();
 assert.ok(await history.locator('.teammate-messages').evaluate(el=>el.scrollTop<100));await history.getByRole('button',{name:'Latest messages ↓',exact:true}).click();assert.ok(await history.locator('.teammate-messages').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<80));await history.close();
 console.log(`PASS ${kind}: dark/light, compact layouts, attachment and draft persistence, quotes, sends, interrupted recovery, 402 recovery, Code switch, account isolation, approval freshness, stop, failed-load recovery, 210-message history, scroll anchoring.`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
