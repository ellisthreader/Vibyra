import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveFixture} from './fixture-server.mjs';
const {url,close}=await serveFixture('tests/agentsBrowserFixture.tsx');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const theme of ['dark','light']) for(const timeout of [false,true]) {
  const p=await browser.newPage({viewport:{width:393,height:852}}); const b=name=>p.getByRole('button',{name,exact:true});const tab=name=>p.getByRole('tab',{name,exact:true});
  await p.goto(`${url}/?empty&theme=${theme}${timeout?'&skill-timeout':''}`);await tab('Agents').click();await b('New teammate').click();
  await p.getByLabel('Teammate name').fill('Source helper');await p.getByLabel('Teammate task').fill('Review reports.');await tab('Skills').click();
  await b('New skill').click();await p.getByLabel('Skill name').fill('Source review');await p.getByLabel('Skill instructions').fill('Check every claim against its original source.');
  assert.equal(await b('Create teammate').isDisabled(),true);
  await tab('Memory').click();await tab('Skills').click();assert.equal(await p.getByLabel('Skill name').inputValue(),'Source review');
  await b('Save skill').click();
  if(timeout){await b('Retry skill save').waitFor();const first=await p.evaluate(()=>window.agentCalls.find(x=>x.action==='skill-save'));await p.reload();await b('New teammate').click();await tab('Skills').click();await b('Retry skill save').click();await p.waitForFunction(()=>window.agentCalls.some(x=>x.action==='skill-save'));assert.deepEqual(await p.evaluate(()=>window.agentCalls.find(x=>x.action==='skill-save')),first);await b('Retry skill save').click();}
  await p.getByRole('checkbox',{name:'Source review',exact:true}).waitFor();assert.equal(await p.getByRole('checkbox',{name:'Source review',exact:true}).isChecked(),true);
  await p.screenshot({path:`../output/teammate-profile/skills-${theme}-${timeout?'retry':'new'}.png`});await b('Create teammate').click();await p.getByLabel('Message Source helper').waitFor();
  const saved=await p.evaluate(()=>window.agentCalls.filter(x=>x.action==='save').at(-1));assert.equal(saved.fields.skillIds.length,1);
  await b('Teammate details').click();await tab('Skills').click();assert.equal(await p.getByRole('checkbox',{name:'Source review',exact:true}).isChecked(),true);
  await p.getByRole('checkbox',{name:'Source review',exact:true}).click();await b('Save changes').click();await p.getByLabel('Message Source helper').waitFor();assert.deepEqual(await p.evaluate(()=>window.agentCalls.filter(x=>x.action==='save').at(-1).fields.skillIds),[]);
  await p.close();
 }
 console.log('PASS inline skills: create, select, save, reopen, unassign, tab draft, cold exact retry, both themes.');
}finally{await browser.close();close();}
