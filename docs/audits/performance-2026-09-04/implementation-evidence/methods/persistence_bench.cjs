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

const { createLatestPersistenceTask } = require('/home/ellis/Desktop/Vibyra/src/utils/latestPersistenceTask.ts');
const source={chatThreads:{},chatTitles:{},detachedChatThreads:{},detachedChatTitles:{},detachedChatUpdatedAt:{},chatProjects:{},projectMemories:{},editApprovals:{}};
for(let t=0;t<40;t++)source.detachedChatThreads['t'+t]=Array.from({length:80},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',text:'Synthetic performance fixture. '+String(i).padStart(4,'0')+' '+ 'abcdefghij '.repeat(180)}));
const run=()=>JSON.stringify(createPersistableAppState(source));
for(let n=0;n<5;n++)run();
let final='',count=0;let start=performance.now();
for(let n=0;n<100;n++){source.detachedChatTitles.t0=String(n);final=run();count++;}
const legacy={normalizations:count,cpuMs:performance.now()-start,finalTitle:JSON.parse(final).detachedChatTitles.t0};
count=0;const task=createLatestPersistenceTask();start=performance.now();
for(let n=0;n<100;n++){source.detachedChatTitles.t0=String(n);task.schedule(()=>{final=run();count++;});}
task.flush();
const coalesced={normalizations:count,cpuMs:performance.now()-start,finalTitle:JSON.parse(final).detachedChatTitles.t0};
if(coalesced.normalizations!==1||coalesced.finalTitle!=='99')throw Error('Final snapshot was not preserved');
fs.writeFileSync(out+'/persistence-bench.json',JSON.stringify({kind:'100 synchronous snapshot changes; 40 x 80 messages; Node CPU work, not device frame timing',legacy,coalesced},null,2));
console.log('Persistence benchmark passed');
