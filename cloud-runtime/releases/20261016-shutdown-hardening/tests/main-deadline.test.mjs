import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const source=await fs.readFile(path.join(process.env.STOP_REVIEW_SOURCE,'main.mjs'),'utf8');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
async function fixture({bootPending=false}={}) {
 let now=0,active=true,started=false;const timers=new Set(),intervals=[],events=new Map(),exits=[],commands=[],shutdowns=[],errors=[];
 const timeout=(fn,ms)=>{const timer={fn,at:now+ms,unref(){return this;}};timers.add(timer);return timer;};
 const context=vm.createContext({console,AbortController,Promise,Date:class extends Date{static now(){return now;}},
  setTimeout:timeout,clearTimeout:t=>timers.delete(t),setInterval:(fn,ms)=>{intervals.push({fn,ms});return {unref(){}};},clearInterval(){},
  process:{env:{VIBYRA_WORKSPACE_ID:'synthetic',VIBYRA_GENERATION:'1'},on:(event,fn)=>events.set(event,fn),exit:code=>exits.push({at:now,code})}});
 class Client {async call(route){return route==='/bootstrap'?{mode:'computer',token:'synthetic',limits:{}}:{lease:{}};}}
 class Lease {active(){return active;}accept(){}}
 class WorkerClient {close(){} async call(){return new Promise(()=>{});}}
 const stubs={
  './egress-limit.mjs':{EgressLimit:class{},egressCounter:async()=>0},
  'node:fs/promises':{default:{writeFile:async()=>{},mkdir:async()=>{},chmod:async()=>{}}},
  'node:child_process':{execFile:(cmd,args,...rest)=>{commands.push({at:now,cmd,args,options:typeof rest[0]==='object'?rest[0]:null});}},
  './client.mjs':{Client},'./lease.mjs':{Lease},'./worker-client.mjs':{WorkerClient},
  './git.mjs':{cloneSource:async()=>{},headRevision:async()=>{}},
  './computer.mjs':{runComputer:async({heartbeat})=>{await heartbeat();started=true;if(bootPending)return new Promise(()=>{});return {shutdown:options=>{shutdowns.push(options);return new Promise(()=>{});}};}},
  './graceful-stop.mjs':{STOP_GRACE_MS:10000,EXPIRY_GRACE_MS:5000},
  './sync-loop.mjs':{FINAL_BUDGET_MS:8000,APPLY_GRACE_MS:15000},
 };
 const module=new vm.SourceTextModule(source,{context,identifier:'actual-main.mjs'});
 await module.link(spec=>{assert.ok(stubs[spec],`unmodelled boundary ${spec}`);const values=stubs[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});});
 void module.evaluate().catch(e=>errors.push(e));await flush();assert.equal(started,true);assert.deepEqual(errors,[]);
 const advance=async target=>{while(true){const next=[...timers].filter(t=>t.at<=target).sort((a,b)=>a.at-b.at)[0];if(!next)break;timers.delete(next);now=next.at;next.fn();await flush();}now=target;await flush();};
 return {events,exits,commands,shutdowns,advance,expire:()=>{active=false;intervals.find(i=>i.ms===100).fn();},async term(){events.get('SIGTERM')();await flush();}};
}
test('requested stop exits by37s even if shutdown and kill callback never settle',async()=>{
 const f=await fixture();await f.term();await f.advance(37000);assert.ok(f.exits.some(e=>e.at<=37000),'unconditional exit timer required');
 assert.equal(f.commands.at(-1).options?.killSignal,'SIGKILL');assert.ok(f.commands.at(-1).options?.timeout<=1000);
});
test('expiry during requested stop aborts shutdown and shortens total exit to8s',async()=>{
 const f=await fixture();await f.term();await f.advance(1000);f.expire();await f.advance(9000);
 assert.equal(f.shutdowns.length,1);assert.equal(f.shutdowns[0].signal?.aborted,true);assert.ok(f.exits.some(e=>e.at<=9000));
});
test('repeated ordinary stop cannot extend an earlier expiry deadline',async()=>{
 const f=await fixture();await f.term();await f.advance(1000);f.expire();await f.advance(2000);await f.term();await f.advance(9000);assert.ok(f.exits.some(e=>e.at<=9000));
});
test('expiry during computer boot has the same8s bound before runComputer returns',async()=>{
 const f=await fixture({bootPending:true});await f.advance(1000);f.expire();await f.advance(9000);assert.ok(f.exits.some(e=>e.at<=9000),'boot must not bypass the computer deadline or use legacy checkpoint path');
});
