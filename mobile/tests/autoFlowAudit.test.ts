import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import path from 'node:path';
import { existsSync } from 'node:fs';
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('Auto hook reviews changed quotes and fences cancelled, edited and backgrounded preparations', { skip: !existsSync(chrome) && 'Chrome not available for hook browser audit' }, async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {useAutoPreparation} from './src/vibes/useAutoPreparation';
    import {VibesError} from './src/vibes/api';
    const base={quote:'baseline',model:'small',effort:'low',maxCredits:5,estimatedCredits:5,expiresAt:Date.now()/1000+120,smartAuto:true};
    const state={identity:'account-a/chat-a/draft-a',active:true,result:null,requests:[],replies:[],reject:false,contextRevision:0,refreshes:0};
    const api={prepareAuto:async(id,quote)=>{state.requests.push({id,quote});if(state.reject){const kind=state.reject;state.reject=false;if(kind==='network')throw new Error('Connection lost');throw new VibesError('Refresh the estimate',409)}},autoPreparation:()=>new Promise(resolve=>state.replies.push(resolve))};
    function App(){window.hook=useAutoPreparation(api,state.identity,state.active,state.contextRevision,()=>{state.refreshes++;base.smartAuto=false});return null}
    const root=createRoot(document.getElementById('root'));
    window.harness={state,base,render:()=>flushSync(()=>root.render(<App/>)),start:()=>{state.result='pending';window.hook.resolve(base).then(x=>state.result=x)},
      reply:(change={})=>state.replies.shift()({state:'ready',quote:{...base,quote:'prepared',...change}})};
    window.harness.render();
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{name:'audit-native-stubs',setup(b){
      b.onResolve({filter:/^(react-native|expo-crypto)$/},args=>({path:args.path,namespace:'audit'}));
      b.onResolve({filter:/transport\/secureStorage$/},()=>({path:'storage',namespace:'audit'}));
      b.onLoad({filter:/.*/,namespace:'audit'},args=>({contents:args.path==='react-native'
        ? 'export const AppState={addEventListener:(_,fn)=>{window.background=fn;return{remove(){}}}}'
        : args.path==='expo-crypto' ? 'let n=0;export const randomUUID=()=>`fixture-${++n}`;export const CryptoDigestAlgorithm={SHA256:1};export const digestStringAsync=async(_,s)=>btoa(s);'
        : 'const memory=new Map();export const readSecure=async(k)=>memory.get(k)??null;export const writeSecure=async(k,v)=>memory.set(k,v);export const deleteSecure=async(k)=>memory.delete(k);'}));
    }}] });
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  try {
    const page=await browser.newPage(); await page.setContent('<div id="root"></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const start=async()=>{await page.evaluate(()=> (window as any).harness.start());await page.waitForFunction(()=> (window as any).harness.state.replies.length>0);};
    await start(); await page.evaluate(()=> (window as any).harness.reply({model:'large',maxCredits:12}));
    await page.waitForFunction(()=> (window as any).harness.state.result===null);
    assert.equal(await page.evaluate(()=> (window as any).hook.quote.model),'large');
    await page.evaluate(()=> (window as any).harness.start());
    await page.waitForFunction(()=> (window as any).harness.state.result?.model==='large');
    assert.equal(await page.evaluate(()=> (window as any).harness.state.requests.length),1,'Explicit review reuses quote');
    await page.evaluate(()=>{const h=(window as any).harness;h.state.contextRevision++;h.render()});
    assert.equal(await page.evaluate(()=> (window as any).hook.quote),null,'Personal preference revision clears reviewed quote');
    for (const action of ['cancel','edit','background','account','preferences']) {
      await page.evaluate(()=>{const h=(window as any).harness;h.state.identity+='next';h.render()});
      await start();
      await page.evaluate(action=>{const w=window as any; if(action==='cancel')w.hook.cancel();
        if(action==='edit'||action==='account'){w.harness.state.identity+=action;w.harness.render()}
        if(action==='background')w.background('background');
        if(action==='preferences'){w.harness.state.contextRevision++;w.harness.render()}w.harness.reply();},action);
      await page.waitForFunction(()=> (window as any).harness.state.result===null);
      assert.equal(await page.evaluate(()=> (window as any).hook.quote),null,`${action} discards late result`);
    }
    await page.evaluate(()=>{const h=(window as any).harness;h.state.identity='rejected-draft';h.state.reject=true;h.render();h.start()});
    await page.waitForFunction(()=> (window as any).hook.error!==null && !(window as any).hook.busy);
    const refused=await page.evaluate(()=> (window as any).harness.state.requests.at(-1));
    assert.equal(await page.evaluate(()=> (window as any).harness.state.refreshes),1,'Refusal refreshes typing estimate');
    const requestCount=await page.evaluate(()=> (window as any).harness.state.requests.length);
    await page.evaluate(()=> (window as any).harness.start());
    await page.waitForFunction(()=> (window as any).harness.state.result?.quote==='baseline');
    assert.equal(await page.evaluate(()=> (window as any).harness.state.requests.length),requestCount,'Disabled Smart Auto uses refreshed local quote without another preparation');
    await page.evaluate(()=>{(window as any).harness.base.smartAuto=true});
    await page.evaluate(()=>{const h=(window as any).harness;h.base.quote='refreshed-baseline';h.start()});
    await page.waitForFunction(()=> (window as any).harness.state.replies.length>0);
    const retried=await page.evaluate(()=> (window as any).harness.state.requests.at(-1));
    assert.notEqual(retried.id,refused.id,'A rejected stale preparation must not trap retries on the same identity');
    assert.equal(retried.quote,'refreshed-baseline');
    await page.evaluate(()=> (window as any).harness.reply());
    await page.waitForFunction(()=> (window as any).harness.state.result!=='pending');
    await page.evaluate(()=>{const h=(window as any).harness;h.state.identity='ambiguous-draft';h.state.reject='network';h.render();h.start()});
    await page.waitForFunction(()=> (window as any).hook.error==='Connection lost' && !(window as any).hook.busy);
    const ambiguous=await page.evaluate(()=> (window as any).harness.state.requests.at(-1));
    await start();
    const recovered=await page.evaluate(()=> (window as any).harness.state.requests.at(-1));
    assert.deepEqual(recovered,ambiguous,'Network ambiguity must retain the same preparation identity');
    await page.evaluate(()=> (window as any).harness.reply());
    await page.close();
  } finally {await browser.close()}
});
