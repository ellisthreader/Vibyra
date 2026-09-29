/** Capture paired production UI with a local, sanitized Orbit project. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('../output/pocket-marketing');
await mkdir(out, { recursive: true });
const desktopEntry = resolve('../desktop-tauri/tests/pocketMarketingDesktopFixture.tsx');
const mobileEntry = resolve('tests/pocketMarketingPhoneFixture.tsx');
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)]
  .filter(match => !match[1].includes('first-welcome'))
  .map(match => `import ${JSON.stringify(resolve('../desktop-tauri/src', match[1]))};`).join('\n');
const desktop = await build({ stdin:{contents:`${styles}\nimport ${JSON.stringify(desktopEntry)};`,resolveDir:process.cwd()},
  plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}],
  bundle:true,write:false,outfile:'/tmp/pocket-desktop.js',format:'iife',jsx:'automatic',
  loader:{'.png':'dataurl','.webp':'dataurl','.woff2':'dataurl','.ttf':'dataurl'} });
const mobile = await build({entryPoints:[mobileEntry],bundle:true,write:false,format:'iife',jsx:'automatic',
  resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'],
  alias:{'react-native':'react-native-web',expo:'expo-modules-core'},
  define:{'process.env.NODE_ENV':'"development"','process.env':'{}',__DEV__:'true',global:'globalThis'},
  loader:{'.js':'jsx','.png':'dataurl','.ttf':'dataurl','.webp':'dataurl'},
  plugins:[{name:'local-preview',setup(b){
    b.onResolve({filter:/^react-native-webview$/},()=>({path:'webview',namespace:'capture'}));
    b.onLoad({filter:/webview/,namespace:'capture'},()=>({loader:'tsx',resolveDir:process.cwd(),contents:`
      import React from 'react';
      export const WebView = React.forwardRef((props,ref) => <iframe ref={ref} title="Project preview"
        src={props.source?.uri} style={{width:'100%',height:'100%',border:0,background:'#fff'}}
        onLoad={() => { const url=props.source.uri; props.onLoadStart?.({nativeEvent:{url}});
          props.onLoadProgress?.({nativeEvent:{progress:1}});
          props.onMessage?.({nativeEvent:{url,data:JSON.stringify({preview:1,kind:'ready',url})}}); }} />);
    `}));
    b.onResolve({filter:/^node:async_hooks$/},()=>({path:'async',namespace:'capture'}));
    b.onLoad({filter:/async/,namespace:'capture'},()=>({contents:'export class AsyncLocalStorage { getStore(){return undefined;} }'}));
  }}] });
const site = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{margin:0;background:#f6f6ef;color:#26342d;font-family:Arial,sans-serif}header{padding:20px 7%;border-bottom:1px solid #e5e8de;font-weight:700}main{padding:10vh 10%;max-width:760px}small{letter-spacing:.18em;color:#71917c}h1{font-size:clamp(40px,7vw,90px);line-height:1.03;letter-spacing:-.05em;margin:24px 0}p{font-size:18px;line-height:1.5;color:#63766a}.habit{background:white;border:1px solid #e5e8de;border-radius:16px;padding:22px;display:flex;align-items:center;gap:18px;max-width:510px;margin-top:42px;box-shadow:0 20px 50px #50604d10}.habit button{width:29px;height:29px;border:2px solid #8faf97;border-radius:50%;background:#fff;cursor:pointer}.habit.done button{background:#719d7b}.habit strong{font-size:16px}.habit span{display:block;color:#8a998c;margin-top:7px;font-size:13px}</style>
  <header>orbit</header><main><small>MAKE ROOM FOR A LITTLE GOOD</small><h1>Small steps.<br>Good things.</h1><p>A calmer space for your everyday habits.</p><div class="habit"><button aria-label="Complete A little movement"></button><div><strong>A little movement</strong><span>Clear your head. Find your pace.</span></div></div></main>
  <script>document.querySelector('.habit button').onclick=()=>document.querySelector('.habit').classList.toggle('done');window.addEventListener('message',e=>{if(e.data==='complete')document.querySelector('.habit').classList.add('done')})</script>`;
const stage = (scene, portrait) => `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101319;font-family:Inter,Arial,sans-serif;color:#a9b2c4}
  body{background:radial-gradient(ellipse at 48% 51%,#20283c 0%,#141923 49%,#101319 90%)}
  .device{position:absolute;overflow:hidden;background:#181b22;border:1px solid #394052;box-shadow:0 40px 110px #03050b99,0 0 0 1px #7893ff1c}
  .desktop{left:70px;top:130px;width:1382px;height:855px;border-radius:18px;padding:7px}
  .desktop iframe{width:1200px;height:740px;transform:scale(1.14);transform-origin:top left;border:0;border-radius:10px;background:#111}
  .phone{right:80px;top:145px;width:386px;height:755px;border-radius:55px;padding:19px 13px;background:#080a0f;border:2px solid #545b6e;box-shadow:0 45px 120px #03050bcb,0 0 0 5px #11151d}
  .phone:before{content:'';position:absolute;left:50%;top:8px;transform:translateX(-50%);width:105px;height:20px;border-radius:13px;background:#080a0f;z-index:2}
  .phone iframe{width:390px;height:780px;transform:scale(.908);transform-origin:top left;border:0;border-radius:36px;background:#111}
  .base{position:absolute;left:150px;top:985px;width:1222px;height:16px;border-radius:0 0 90px 90px;background:linear-gradient(#777f8b,#303644 62%,#1b1f27);box-shadow:0 25px 45px #0008}
  .scene-projects .desktop{left:210px;top:70px;width:820px;height:940px;border-radius:23px;padding:8px}
  .scene-projects .desktop iframe{transform:scale(1.62);border-radius:14px}
  .scene-projects .phone{right:210px;top:35px;width:516px;height:1010px}
  .scene-projects .phone iframe{transform:scale(1.22)}
  .scene-projects .base{display:none}
  .portrait .desktop,.portrait .base{display:none}
  .portrait .phone{left:65px;right:auto;top:35px;width:950px;height:1850px;border-radius:125px;padding:45px 28px;border:5px solid #545b6e;background:#080a0f;box-shadow:0 75px 160px #03050bcb,0 0 0 10px #11151d}
  .portrait .phone:before{display:block;top:18px;width:220px;height:42px;border-radius:25px}
  .portrait .phone iframe{transform:scale(2.24);border-radius:40px}
  </style><body class="scene-${scene} ${portrait ? 'portrait' : ''}">
  <div class="device desktop"><iframe id="desktop" src="/desktop?scene=${scene}"></iframe></div><div class="base"></div>
  <div class="device phone"><iframe id="phone" src="/phone?scene=${scene}"></iframe></div>`;
const server = createServer((req,res) => {
  const path = new URL(req.url,'http://127.0.0.1').pathname;
  const js = path === '/desktop.js' ? desktop.outputFiles.find(file => file.path.endsWith('.js')) :
    path === '/phone.js' ? mobile.outputFiles[0] : null;
  const css = path === '/desktop.css' ? desktop.outputFiles.find(file => file.path.endsWith('.css')) : null;
  res.setHeader('Content-Type',js ? 'text/javascript' : css ? 'text/css' : 'text/html; charset=utf-8');
  if (js || css) return res.end((js || css).contents);
  if (path === '/orbit.html') return res.end(site);
  if (path === '/desktop') return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/desktop.css"><div id="root"></div><script src="/desktop.js"></script>');
  if (path === '/phone') return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}</style><div id="root"></div><script src="/phone.js"></script>');
  const params = new URL(req.url,'http://127.0.0.1').searchParams;
  return res.end(stage(params.get('scene') || 'projects', params.get('portrait') === '1'));
});
await new Promise(done => server.listen(3000,'127.0.0.1',done));
const browser = await chromium.launch({headless:true});
try {
  const portrait = process.argv.includes('portrait');
  const requested = ['projects','terminal','preview'].filter(scene => process.argv.includes(scene));
  const scenes = requested.length ? requested : ['projects','terminal','preview'];
  for (const scene of scenes) {
    const name = `${portrait ? 'mobile-' : ''}${scene}`;
    const dir = `${out}/${name}`; await mkdir(dir,{recursive:true});
    const page = await browser.newPage({viewport:{width:portrait ? 1080 : 1920,height:portrait ? 1920 : 1080},deviceScaleFactor:1});
    page.on('pageerror',error => console.error(`${scene}: ${error.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=${scene}&portrait=${portrait ? 1 : 0}`);
    await page.waitForTimeout(scene === 'projects' ? 650 : 1100);
    if (!portrait && scene !== 'projects') await page.frames().find(frame => frame.url().includes('/desktop?'))?.locator('.xterm').waitFor();
    if (!portrait && scene === 'preview') await page.frames().find(frame => frame.url().includes('/desktop?'))?.evaluate(() => window.pocketTerminal(7));
    for (let frame=0; frame<100; frame++) {
      if (scene === 'projects' && [12,42,72].includes(frame)) {
        const id = {12:'orbit',42:'weekend',72:'studio'}[frame];
        if (!portrait) await page.frames().find(value => value.url().includes('/desktop?'))?.evaluate(id => window.pocketChooseProject(id),id);
        await page.frames().find(value => value.url().includes('/phone?'))?.evaluate(id => window.pocketChooseProject(id),id);
        if (!portrait) await page.frames().find(value => value.url().includes('/desktop?'))?.locator('.xterm').waitFor();
        await page.waitForTimeout(180);
        if (portrait) await page.frames().find(value => value.url().includes('/phone?'))?.evaluate(() => window.pocketShowProjects());
        if (!portrait) await page.frames().find(value => value.url().includes('/desktop?'))?.evaluate(() => window.pocketTerminal(7));
      }
      if (scene === 'projects' && [30,60].includes(frame)) {
        if (!portrait) await page.frames().find(value => value.url().includes('/desktop?'))?.evaluate(() => window.pocketShowProjects());
        await page.frames().find(value => value.url().includes('/phone?'))?.evaluate(() => window.pocketShowProjects());
      }
      if (scene === 'terminal' && frame % 7 === 0) {
        const step = Math.min(11,Math.floor(frame/7)+1);
        if (!portrait) await page.frames().find(value => value.url().includes('/desktop?'))?.evaluate(step => window.pocketTerminal(step),step);
        await page.frames().find(value => value.url().includes('/phone?'))?.evaluate(step => window.pocketTerminal(step),step);
      }
      if (scene === 'preview' && frame === 55) for (const siteFrame of page.frames().filter(value => value.url().includes('/orbit.html'))) {
        await siteFrame.locator('.habit button').evaluate(button => button.click());
      }
      const image = await page.screenshot({type:'jpeg',quality:93});
      await writeFile(`${dir}/${String(frame).padStart(3,'0')}.jpg`,image);
    }
    await writeFile(`${out}/${name}.jpg`,await readFile(`${dir}/${scene === 'preview' ? '074' : scene === 'projects' ? '005' : '068'}.jpg`));
    await page.close();
    console.log(`${name}: 100 frames at ${portrait ? '1080×1920' : '1920×1080'}`);
  }
} finally { await browser.close(); server.close(); }
