import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serveFixture} from './fixture-server.mjs';
const {url,close}=await serveFixture('tests/agentsBrowserFixture.tsx');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
await mkdir('../output/teammate-profile',{recursive:true});
try {
 for(const width of [320,393]) for(const theme of ['dark','light']) {
  const p=await browser.newPage({viewport:{width,height:852}});await p.goto(`${url}/?empty&theme=${theme}`);
  await p.getByRole('tab',{name:'Agents',exact:true}).click();await p.getByRole('button',{name:'New teammate',exact:true}).click();
  for(const name of ['Auto','OpenAI','Anthropic','Google','xAI','DeepSeek']) {
   const choice=p.getByRole('radio',{name,exact:true});await choice.scrollIntoViewIfNeeded();
   const rect=await choice.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width,`${name} fits ${width}`);
  }
  await p.getByRole('radio',{name:'OpenAI',exact:true}).click();assert.equal(await p.getByRole('radio',{name:'OpenAI',exact:true}).isChecked(),true);
  await p.getByRole('radio',{name:'DeepSeek',exact:true}).scrollIntoViewIfNeeded();
  await p.screenshot({path:`../output/teammate-profile/phone-providers-${theme}-${width}.png`});
  assert.equal(await p.getByRole('textbox',{name:'Search choices'}).isVisible(),false);
  await p.close();
 }
 console.log('PASS provider grids: both themes, 320/393 widths, six choices, selection, no model search.');
}finally{await browser.close();close();}
