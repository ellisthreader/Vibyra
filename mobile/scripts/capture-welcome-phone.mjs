// Records the SAME production mobile discovery/approval/Remote components used on iOS.
// Only discovery and the handshake are mocked. No live network or approval occurs.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const output = resolve('../desktop-tauri/src/assets/welcome');
const temporary = '/tmp/vibyra-welcome-phone';
await mkdir(temporary,{recursive:true});
const bundle = await build({entryPoints:['tests/welcomePhoneFixture.tsx'],bundle:true,write:false,format:'iife',jsx:'automatic',
  resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'],alias:{'react-native':'react-native-web',expo:'expo-modules-core'},
  define:{'process.env.NODE_ENV':'"development"','process.env':'{}',__DEV__:'true',global:'globalThis'},
  loader:{'.js':'jsx','.png':'dataurl','.ttf':'dataurl','.webp':'dataurl'},
  plugins:[{name:'sample-discovery',setup(b){
    b.onResolve({filter:/^\.\/localDiscovery$/},()=>({path:'discovery',namespace:'sample'}));
    b.onLoad({filter:/discovery/,namespace:'sample'},()=>({contents:`export const localDiscovery={available:true,start(update){update({status:'searching',computers:[],networks:[{id:'wifi',kind:'wifi',label:'Wi-Fi',searched:true}]});const timer=setTimeout(()=>update({status:'searching',networks:[],computers:[{id:'sample',name:'Studio Mac',platform:'macos',hostId:'ab'.repeat(32),host:'192.168.1.24',port:4318}]}),2600);return ()=>clearTimeout(timer);}};`}));
    b.onResolve({filter:/^node:async_hooks$/},()=>({path:'async',namespace:'sample'}));
    b.onLoad({filter:/async/,namespace:'sample'},()=>({contents:'export class AsyncLocalStorage { getStore(){return undefined;} }'}));
  }}]});
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}[aria-label="Connect your computer"][aria-modal="true"]{top:0!important;border-top-left-radius:0!important;border-top-right-radius:0!important}</style><div id="root"></div><script src="/fixture.js"></script>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch();
let encoder;
try {
 let ffmpeg=process.env.FFMPEG_PATH;
 if(!ffmpeg) {
  const probe=await browser.newContext({recordVideo:{dir:temporary}});
  const page=await probe.newPage();
  await page.setContent('');
  ffmpeg=execFileSync('ps',['-axo','command'],{encoding:'utf8'}).split('\n').find(line=>line.includes(temporary)&&/ffmpeg[^ ]* -loglevel error/.test(line))?.split(' -loglevel')[0].trim();
  await probe.close();
 }
 if(!ffmpeg) throw new Error('Set FFMPEG_PATH to the ffmpeg executable.');
 for(const theme of ['dark','light']) {
  // Record maximum-quality retina frames, then encode once. Browser video recording
  // first compresses at CSS resolution, which irreversibly softens small text.
  const context=await browser.newContext({viewport:{width:390,height:780},deviceScaleFactor:2});
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`);
  await page.getByRole('button',{name:'I’ve installed it',exact:true}).click();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  encoder=spawn(ffmpeg,['-loglevel','error','-f','image2pipe','-vcodec','mjpeg','-r','25','-i','pipe:0','-an','-c:v','libvpx','-b:v','3M','-crf','4','-deadline','realtime','-cpu-used','4','-g','25','-y',`${output}/iphone-connection-${theme}.webm`],{stdio:['pipe','ignore','inherit']});
  const finished=once(encoder,'close');
  for(let frame=0;frame<250;frame++) {
    if(frame===100) await page.getByRole('button',{name:'Yes, connect',exact:true}).click();
    if(frame===160) await page.evaluate(()=>window.approveWelcomePhone());
    await page.clock.runFor(40);
    const frameImage=await page.screenshot({type:'jpeg',quality:100});
    if(!encoder.stdin.write(frameImage)) await Promise.race([once(encoder.stdin,'drain'),finished.then(([code])=>{throw new Error(`Encoder closed early: ${code}`);})]);
    if(frame===30 || frame===150 || frame===249) {
      const name=frame===30?'iphone-search':frame===150?'iphone-approval':'iphone';
      await page.screenshot({path:`${output}/${name}-${theme}.jpg`,type:'jpeg',quality:98});
    }
  }
  encoder.stdin.end();
  const [code]=await finished;
  if(code!==0) throw new Error(`Phone encoder failed: ${code}`);
  await context.close();
  console.log(`Captured ${theme}: 10s, 780×1560, 25 fps, full-bleed production phone UI.`);

 }
} finally {encoder?.stdin.destroy(); if(encoder?.exitCode === null) encoder.kill(); await browser.close();server.close();}
