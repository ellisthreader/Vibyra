const fs = require('node:fs');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');
const ts = require('/home/ellis/Desktop/Vibyra/node_modules/typescript');
const out = __dirname;
require.extensions['.ts'] = (mod, file) => {
 const source=fs.readFileSync(file,'utf8');
 mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
};
const { createPersistableAppState } = require('/home/ellis/Desktop/Vibyra/src/context/appStatePersistence.ts');
const { dispatch, attach, clear } = require('/home/ellis/Desktop/Vibyra/desktop-tauri/src/lib/terminalBus.ts');
const quant=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.ceil(xs.length*p)-1)];
const rows=[];
for(const threads of [1,10,40]){
 const source={chatThreads:{},chatTitles:{},detachedChatThreads:{},detachedChatTitles:{},detachedChatUpdatedAt:{},chatProjects:{},projectMemories:{},editApprovals:{}};
 for(let t=0;t<threads;t++)source.detachedChatThreads['t'+t]=Array.from({length:80},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',text:'Synthetic performance fixture. '+String(i).padStart(4,'0')+' '+ 'abcdefghij '.repeat(180)}));
 const norm=[],serial=[],both=[];let bytes=0;
 for(let n=0;n<25;n++){
  const start=performance.now();const state=createPersistableAppState(source);const middle=performance.now();const body=JSON.stringify(state);const end=performance.now();bytes=Buffer.byteLength(body);
  if(n>=5){norm.push(middle-start);serial.push(end-middle);both.push(end-start);}
 }
 rows.push({threads,messages:threads*80,bytes,samples:both.length,normaliseP50ms:quant(norm,.5),serialiseP50ms:quant(serial,.5),totalP50ms:quant(both,.5),totalP95ms:quant(both,.95)});
}
let busCount=0;const busStart=performance.now();for(let n=0;n<10000;n++)dispatch(1000,{type:'output',data:'x'.repeat(1024)});attach(1000,()=>busCount++);clear(1000);const busMs=performance.now()-busStart;
const result={runtime:process.version,kind:'Node CPU microbenchmark; not a Hermes or device frame measurement',rows,terminalBus:{tenThousandDetached1KiBEventsMs:busMs,retainedEvents:busCount}};
fs.writeFileSync(out+'/mobile-bench.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
