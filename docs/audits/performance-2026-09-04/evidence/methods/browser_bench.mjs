import {writeFileSync} from 'node:fs';
import WebSocket from '/home/ellis/Desktop/Vibyra/node_modules/ws/wrapper.mjs';
const out='/tmp/vibyra-performance-audit-20260904-KNtjVg';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){
 const target=await (await fetch('http://127.0.0.1:18744/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));
 let id=0;const pending=new Map();const listeners=new Map();
 ws.on('message',data=>{const m=JSON.parse(String(data));if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else for(const fn of listeners.get(m.method)??[])fn(m.params);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const on=(method,fn)=>listeners.set(method,[...(listeners.get(method)??[]),fn]);
 return {send,on,close:async()=>{ws.close();await fetch('http://127.0.0.1:18744/json/close/'+target.id);}};
}
const results=[];
for(const scenario of [{name:'desktop',width:1440,height:900,reduced:false},{name:'mobile',width:390,height:844,reduced:false},{name:'reduced-motion',width:1440,height:900,reduced:true}]){
 const c=await connect();const requests=new Map();const exceptions=[];
 c.on('Network.requestWillBeSent',p=>requests.set(p.requestId,{url:p.request.url,type:p.type}));
 c.on('Network.responseReceived',p=>Object.assign(requests.get(p.requestId)??{}, {status:p.response.status,mime:p.response.mimeType,cache:p.response.fromDiskCache??false}));
 c.on('Network.loadingFinished',p=>Object.assign(requests.get(p.requestId)??{}, {encodedBytes:p.encodedDataLength}));
 c.on('Network.loadingFailed',p=>Object.assign(requests.get(p.requestId)??{}, {failure:p.errorText}));
 c.on('Runtime.exceptionThrown',p=>exceptions.push(p.exceptionDetails.text));
 await c.send('Network.enable');await c.send('Runtime.enable');await c.send('Page.enable');await c.send('Performance.enable');await c.send('Network.setCacheDisabled',{cacheDisabled:true});
 await c.send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,deviceScaleFactor:1,mobile:scenario.name==='mobile'});
 await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:scenario.reduced?'reduce':'no-preference'}]});
 await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__audit={raf:0,longtasks:[],lcp:[]};const original=requestAnimationFrame;window.requestAnimationFrame=cb=>original.call(window,t=>{window.__audit.raf++;cb(t)});new PerformanceObserver(l=>window.__audit.longtasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>window.__audit.lcp.push(...l.getEntries().map(e=>({start:e.startTime,size:e.size})))).observe({type:'largest-contentful-paint',buffered:true});`});
 await c.send('Page.navigate',{url:'http://127.0.0.1:18743/'});
 for(let i=0;i<60;i++) {await wait(500);const r=await c.send('Runtime.evaluate',{expression:'document.readyState === "complete" && !!document.querySelector("video")',returnByValue:true});if(r.result.value)break;}
 await wait(4000);
 const evalv=async expression=>(await c.send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const before=await evalv('window.__audit.raf');await wait(5000);const after=await evalv('window.__audit.raf');
 const data=await evalv(`({title:document.title,ready:document.readyState,domNodes:document.querySelectorAll('*').length,rafCallbacks:window.__audit.raf,longtasks:window.__audit.longtasks,lcp:window.__audit.lcp,paints:performance.getEntriesByType('paint').map(e=>({name:e.name,start:e.startTime})),brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),videos:[...document.querySelectorAll('video')].map(v=>({src:v.getAttribute('src')?.startsWith('blob:')?'blob':v.getAttribute('src'),readyState:v.readyState,width:v.videoWidth,height:v.videoHeight})),heap:performance.memory?.usedJSHeapSize})`);
 const shot=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/website-'+scenario.name+'.png',Buffer.from(shot.data,'base64'));
 await c.send('Runtime.evaluate',{expression:'window.scrollTo(0,document.body.scrollHeight)'});await wait(2000);
 const offBefore=await evalv('window.__audit.raf');await wait(3000);const offAfter=await evalv('window.__audit.raf');
 results.push({scenario,...data,idleRafCallbacksPerSecond:(after-before)/5,belowHeroRafCallbacksPerSecond:(offAfter-offBefore)/3,requests:[...requests.values()].filter(r=>r.url.startsWith('http')).map(r=>({...r,url:new URL(r.url).pathname})),exceptions});
 await c.close();
}
writeFileSync(out+'/browser-bench.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({scenario:r.scenario.name,domNodes:r.domNodes,brokenImages:r.brokenImages,transferredBytes:r.requests.reduce((s,x)=>s+(x.encodedBytes??0),0),videoRequests:r.requests.filter(x=>x.url.endsWith('.mp4')),idleRafCallbacksPerSecond:r.idleRafCallbacksPerSecond,belowHeroRafCallbacksPerSecond:r.belowHeroRafCallbacksPerSecond,longtasks:r.longtasks,exceptions:r.exceptions})),null,2));
