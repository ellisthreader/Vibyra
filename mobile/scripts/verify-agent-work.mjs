import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {serveFixture} from './fixture-server.mjs';
const out=resolve('../output/agent-stage4-20261008/clients');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const mobile of [false,true]){
 const server=await serveFixture(mobile?'tests/agentWorkBrowserFixture.tsx':'../desktop-tauri/tests/agentWorkBrowserFixture.tsx',{'react':resolve('node_modules/react'),'react-dom':resolve('node_modules/react-dom')},mobile?{}:{[resolve('../desktop-tauri/src/styles/agent-work.css')]:resolve('tests/emptyFixtureStyle.ts')});
 try{for(const light of [false,true])for(const width of mobile?[390]:[960,1280]){
  const page=await browser.newPage({viewport:{width,height:mobile?844:600}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(server.url+(light?'/?light=1':''));
  if(!mobile){await page.evaluate(light=>document.documentElement.dataset.theme=light?'light':'dark',light);const native='/private/tmp/vibyra-cloud-mac-ci-review-20261008/desktop-tauri/src/styles/';const css=await Promise.all(['tokens.css','base.css','base.part-02.css','base.part-03.css','controls.css','teammates.css'].map(p=>readFile(native+p,'utf8')));css.push(await readFile('../desktop-tauri/src/styles/agent-work.css','utf8'));await page.addStyleTag({content:css.join('\n')});}
  await page.getByRole('button',{name:'Edit proposal',exact:true}).waitFor();await page.screenshot({path:`${out}/${mobile?'phone':'desktop'}-${light?'light':'dark'}-${width}-entry.png`});
  await page.getByRole('button',{name:'Edit proposal',exact:true}).click();await page.getByLabel('Skill instructions',{exact:true}).fill('Use plain English. Include decisions and clear owners.');
  await page.getByRole('button',{name:'Save edits & review',exact:true}).click();await page.getByText(/Simulated save response lost/).waitFor();assert.equal(await page.getByRole('button',{name:'Save edits & review',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Refresh proposal',exact:true}).click();await page.getByRole('button',{name:'Edit proposal',exact:true}).waitFor();
  await (mobile?page.getByRole('button',{name:'Review proposal',exact:true}):page.locator('summary').filter({hasText:'Review proposal'})).click();await page.getByText('Use plain English. Include decisions and clear owners.',{exact:true}).waitFor();await page.getByRole('button',{name:'Save skill',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${mobile?'phone':'desktop'}-${light?'light':'dark'}-${width}-review.png`});
  await page.getByRole('button',{name:'Save skill',exact:true}).click();await page.getByText('Saved once. Manage it in Work or Skills.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm goal finished',exact:true}).isDisabled(),true);await (mobile?page.getByRole('button',{name:'Review milestones',exact:true}):page.locator('summary').filter({hasText:'Review milestones'})).click();await page.getByRole('button',{name:'Open task: Launch outline',exact:true}).click();await page.getByRole('button',{name:'Confirm goal finished',exact:true}).click();await page.getByRole('button',{name:'Confirm goal finished',exact:true}).waitFor({state:'detached'});
  await page.getByRole('button',{name:'Pause follow-up',exact:true}).click();await page.getByRole('button',{name:'Resume follow-up',exact:true}).click();await page.getByRole('button',{name:'Cancel follow-up',exact:true}).click();await page.getByRole('button',{name:'Cancel follow-up',exact:true}).waitFor({state:'detached'});
  await (mobile?page.getByRole('button',{name:/Project discovery/}):page.locator('summary').filter({hasText:'Project discovery'})).click();
  if(mobile){await page.getByRole('button',{name:'Ellis · GitHub',exact:true}).click();await page.getByRole('button',{name:/Prepare the launch ·/}).click();}else{await page.getByLabel('GitHub account').selectOption({label:'Ellis · GitHub'});await page.getByLabel('Compare with goal (optional)').selectOption({label:'Prepare the launch · awaiting_review'});}
  await page.getByLabel('GitHub repository to watch').fill('vibyra/launch');await page.getByRole('button',{name:'Watch this project',exact:true}).click();await page.getByText(/You linked this repository to this goal/).waitFor();
  await (mobile?page.getByRole('button',{name:/Relevant starters/}):page.locator('summary').filter({hasText:'Relevant starters'})).click();await page.getByRole('button',{name:'Prepare: Review open pull requests',exact:true}).click();
  const events=await page.getByTestId('events').textContent();assert.equal(events.split('accept-proposal').length-1,1);assert.match(events,/prepare-draft/);assert.match(events,/save-watch:00000002/);assert.match(events,/open-run:00000004/);assert.doesNotMatch(events,/send|grant/);assert.deepEqual(errors,[]);
  console.log(`${mobile?'mobile':'desktop'} ${light?'light':'dark'} ${width}: edit/lost-response/readback/exact accept, goal evidence, follow-up controls, starter draft passed`);await page.close();
 }}finally{server.close();}
}}finally{await browser.close();}
