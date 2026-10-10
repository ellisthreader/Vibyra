import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {serveFixture} from './fixture-server.mjs';
const server=await serveFixture('tests/agentWorkProposalLifecycleFixture.tsx',{'react':resolve('node_modules/react'),'react-dom':resolve('node_modules/react-dom')});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);
 await page.waitForFunction(()=>document.querySelector('[data-testid="state"]')?.textContent==='idle');
 assert.equal(await page.getByTestId('items').textContent(),'');
 await page.getByRole('button',{name:'Start stale read',exact:true}).click();
 await page.getByRole('button',{name:'Finish quickly',exact:true}).click();
 await page.getByRole('button',{name:'Release old response',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="items"]')?.textContent==='Fast task proposal');
 assert.equal(await page.getByTestId('state').textContent(),'idle');
 assert.ok(Number(await page.getByTestId('calls').textContent())<8,'Settled read must be bounded.');
 await page.getByRole('button',{name:'Start stale read',exact:true}).click();
 await page.getByRole('button',{name:'Switch teammate',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="items"]')?.textContent==='Second teammate draft');
 await page.getByRole('button',{name:'Release old response',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="state"]')?.textContent==='idle');
 assert.equal(await page.getByTestId('items').textContent(),'Second teammate draft');assert.equal(await page.getByTestId('error').textContent(),'');assert.deepEqual(errors,[]);
 console.log('PASS: fast completion queues final proposal read; stale response cannot hide proposal or replace another teammate; bounded reads, no browser errors.');
} finally {await browser.close();server.close();}
