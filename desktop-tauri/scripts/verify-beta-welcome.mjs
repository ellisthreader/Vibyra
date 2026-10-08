import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const output=process.env.VIBYRA_BETA_OUTPUT || '../output/beta-welcome-preview';
await mkdir(output,{recursive:true});
const bundle=await build({entryPoints:['tests/betaWelcomeFixture.tsx'],bundle:true,write:false,outfile:'/tmp/beta.js',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.woff2':'dataurl','.ttf':'dataurl'}});
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/beta.css"><div id="root"></div><script src="/beta.js"></script>';
const server=createServer((req,res)=>{const ext=req.url.split('?')[0].split('.').at(-1);const file=bundle.outputFiles.find(f=>f.path.endsWith(`.${ext}`));res.setHeader('Content-Type',file?ext==='js'?'text/javascript':'text/css':'text/html');res.end(file?.contents??html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
let checks=0;
try {
 for (const engine of [chromium,webkit]) {
  const browser=await engine.launch({headless:true});
  try {
   for (const theme of ['dark','light']) {
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}/?theme=${theme}&offline=1`);
    await page.getByRole('heading',{name:'Welcome, Ellis.'}).waitFor();
    assert.equal(await page.evaluate(()=>window.betaTest.calls.length),0);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button',{name:'Let’s build'}).evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'Close welcome'}).evaluate(n=>n===document.activeElement),true);
    await page.screenshot({path:`${output}/implemented-${engine.name()}-${theme}.png`});
    await page.evaluate(()=>window.betaTest.settings());
    await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('[data-beta-welcome]'));
    assert.equal(await page.locator('.shell').evaluate(n=>n.inert),true,'preemption preserves inert workspace');
    assert.equal(await page.getByRole('button',{name:'Close Settings'}).evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press('Escape');
    await page.getByRole('heading',{name:'Welcome, Ellis.'}).waitFor();
    await page.getByRole('button',{name:'Let’s build'}).click();
    await page.waitForFunction(()=>window.betaTest.calls.includes('account_license_welcome'));
    await page.reload();
    await page.waitForFunction(()=>window.betaTest.calls.includes('account_license_welcome'));
    assert.equal(await page.locator('[data-beta-welcome]').count(),0,'offline dismissal survives reload');
    await page.evaluate(()=>window.betaTest.online());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('vibyra.betaWelcome.dismissed.v1'))[0][1]==='synced');
    assert.deepEqual(errors,[]);
    await page.close();checks+=8;
   }
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await page.goto(`${url}/?fixed=1&name=Alexandertheverylongfirstname&onboarding=1`);
   assert.equal(await page.locator('[data-beta-welcome]').count(),0);
   await page.evaluate(()=>window.betaTest.ready());
   await page.getByRole('heading',{name:'Complimentary Pro. Just for you.'}).waitFor();
   assert.equal(await page.locator('.beta-welcome').evaluate(n=>getComputedStyle(n).animationName),'none');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`${output}/implemented-${engine.name()}-mobile.png`});
   await page.getByRole('button',{name:'Report a problem'}).click();
   await page.getByRole('dialog',{name:'Report a problem'}).waitFor();
   assert.equal(await page.locator('[data-next-notice]').count(),0,'next notices wait for the report');
   assert.equal(await page.evaluate(()=>window.betaTest.calls.some(x=>x.includes('submit'))),false);
   await page.close();checks+=6;
   const expiry=await browser.newPage();await expiry.goto(url);
   await expiry.getByRole('dialog').waitFor();
   await expiry.evaluate(()=>window.betaTest.expire());
   await expiry.waitForFunction(()=>!document.querySelector('[data-beta-welcome]'));checks++;
   await expiry.close();
  } finally {await browser.close();}
 }
 console.log(`PASS: ${checks} browser assertions across Chromium and WebKit; dark/light, narrow, keyboard, onboarding, preemption, offline retry, report and expiry.`);
} finally {server.close();}
