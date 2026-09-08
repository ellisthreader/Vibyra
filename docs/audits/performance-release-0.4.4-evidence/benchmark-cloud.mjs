import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const root='/home/ellis/.config/vibyra-desktop/terminal-worktrees/performance-release-0.4.4';
const cache='/home/ellis/.cache/vibyra-performance-release-044';
const require=createRequire(root+'/package.json'),ts=require('typescript');
async function moduleUrl(name){let code=await fs.readFile(root+'/src/utils/'+name+'.ts','utf8');for(const m of [...code.matchAll(/from "\.\/([^\"]+)"/g)])code=code.replaceAll('"./'+m[1]+'"','"'+await moduleUrl(m[1])+'"');return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');}
const {createCloudStateTransport}=await import(await moduleUrl('cloudStateTransport'));
const base=(await fs.readFile(cache+'/fixture-url.txt','utf8')).trim();
let receipts=[];
async function request(path,body){const start=performance.now();const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer isolated-container-fixture'},body});const text=await r.text();assert.equal(r.status,200,text.slice(0,300));const parsed=JSON.parse(text);receipts.push({path,requestBytes:body===undefined?0:Buffer.byteLength(body),responseBytes:Buffer.byteLength(text),elapsedMs:performance.now()-start});return parsed;}
const results=[];
for(const count of [1,10,40]){
 const state={appState:{projectMemories:[],chatThreads:Object.fromEntries(Array.from({length:count},(_,i)=>['t'+i,Array.from({length:80},(_,m)=>({id:'m'+m,text:'x'.repeat(2000)}))]))}};
 const send=createCloudStateTransport(request);await send(JSON.stringify(state),'isolated-container-fixture');
 const runs=[];
 for(let n=0;n<6;n++){
  state.appState.chatThreads.t0[79].text='x'.repeat(2000)+String(n);
  const mode=n%2===0?'legacy-full':'negotiated-delta';const start=performance.now();receipts=[];
  if(mode==='legacy-full')await request('/api/session/state',JSON.stringify(state));else await send(JSON.stringify(state),'isolated-container-fixture');
  runs.push({mode,totalClientMs:performance.now()-start,...receipts[0]});
  const got=await request('/api/session');assert.deepEqual(got.user.appState,state.appState);
  // Advance the transport baseline after legacy writes without changing server data.
  if(mode==='legacy-full')await send(JSON.stringify(state),'isolated-container-fixture');
 }
 results.push({threads:count,messagesPerThread:80,messageCharacters:2000,runs});console.log('Verified '+count+' histories');
}
const report={timestamp:new Date().toISOString(),backendSource:'7a00633',clientSource:'7a00633',environment:'Actual Linux PC; local Docker Nixpacks image; SQLite; loopback; no network shaping; concurrent unrelated workloads',workload:'Edit final text of one existing message; three alternating full and delta samples per size; state readback after every save; byte counts are uncompressed HTTP body bytes, excluding headers/TLS',results};
await fs.writeFile(cache+'/cloud-benchmark.json',JSON.stringify(report,null,2));
