import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
const source=process.env.P06_RUNTIME_SOURCE?pathToFileURL(path.resolve(process.env.P06_RUNTIME_SOURCE)+'/'):new URL('../src/',import.meta.url);
const { createSyncProcess }=await import(new URL('sync-process.mjs',source));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await sleep(5);}throw Error('Fixture did not settle');}
async function mainFixture({ bootPending=false, killPending=false }={}){
  const timers=[],intervals=[],signals={},kills=[],shutdowns=[],exits=[];let clock=0,live=true;
  const computer={shutdown:args=>{shutdowns.push(args);return new Promise(()=>{});}};
  const process={env:{},on:(name,fn)=>signals[name]=fn,exit:()=>exits.push(clock)};
  const timer=(fn,ms)=>{const t={fn,at:clock+ms,cleared:false,unref(){return this;}};timers.push(t);return t;};
  const context=vm.createContext({process,Date:{now:()=>clock},AbortController,Promise,setTimeout:timer,clearTimeout:t=>{if(t)t.cleared=true;},setInterval:fn=>{intervals.push(fn);return{unref(){}};},clearInterval:()=>{}});
  const deps={
    './egress-limit.mjs':{EgressLimit:class{},egressCounter:async()=>0},
    'node:fs/promises':{default:{writeFile:async()=>{},mkdir:async()=>{},chmod:async()=>{}}},
    'node:child_process':{execFile:(cmd,args,options,callback)=>{kills.push({cmd,args,options});if(!killPending)(typeof options==='function'?options:callback)?.();}},
    './client.mjs':{Client:class{async call(route){return route==='/bootstrap'?{mode:'computer',token:'fixture',limits:{}}:{lease:{}};}}},
    './lease.mjs':{Lease:class{active(){return live;}accept(){}}},
    './worker-client.mjs':{WorkerClient:class{close(){}}},'./git.mjs':{cloneSource:()=>{},headRevision:()=>{}},
    './computer.mjs':{runComputer:async({heartbeat})=>{await heartbeat();return bootPending?new Promise(()=>{}):computer;}},
    './graceful-stop.mjs':{STOP_GRACE_MS:10000,EXPIRY_GRACE_MS:5000},'./sync-loop.mjs':{FINAL_BUDGET_MS:8000,APPLY_GRACE_MS:15000},
  };
  const module=new vm.SourceTextModule(await fs.readFile(new URL('main.mjs',source),'utf8'),{context});
  await module.link(spec=>{const exports=deps[spec];assert.ok(exports,`Known dependency ${spec}`);return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});
  void module.evaluate();await sleep(0);
  return {timers,kills,shutdowns,signals,exits,runNext:()=>{const t=timers.filter(t=>!t.cleared).sort((a,b)=>a.at-b.at)[0];t.cleared=true;clock=t.at;t.fn();},advance:ms=>{clock+=ms;},expire:()=>{live=false;intervals[0]();}};
}
test('actual main preempts an ordinary pending shutdown at the earlier expiry deadline',async()=>{
  const f=await mainFixture();f.signals.SIGTERM();await sleep(0);
  assert.equal(f.shutdowns.length,1);f.advance(5000);f.expire();await sleep(0);
  assert.equal(f.shutdowns[0].signal?.aborted,true);assert.ok(f.kills.length>0);
  assert.ok(f.kills.every(k=>k.options.timeout<=1000));
  const deadline=Math.min(...f.timers.filter(t=>!t.cleared).map(t=>t.at));assert.ok(deadline<=13000);
  f.advance(1000);f.expire();assert.equal(Math.min(...f.timers.filter(t=>!t.cleared).map(t=>t.at)),deadline);
  assert.equal(f.shutdowns.length,1,'no second shutdown/final sync');
});
test('actual main starts expiry shutdown cancelled and preserves its short deadline',async()=>{
  const f=await mainFixture();f.expire();await sleep(0);assert.equal(f.shutdowns.length,1);
  assert.equal(f.shutdowns[0].signal?.aborted,true);assert.equal(f.shutdowns[0].graceMs,5000);
  assert.ok(Math.min(...f.timers.filter(t=>!t.cleared).map(t=>t.at))<=8000);
});
test('computer bootstrap gets the expiry watchdog before runComputer resolves, even if pkill hangs',async()=>{
  const f=await mainFixture({bootPending:true,killPending:true});f.expire();await sleep(0);
  assert.equal(f.shutdowns.length,0);assert.ok(f.timers.some(t=>!t.cleared&&t.at<=8000));
  f.runNext();f.runNext();assert.deepEqual(f.exits,[8000]);
});
function syncFixture(){
  const spawned=[];const spawn=(_bin,args)=>{const c=new EventEmitter();c.stdout=new EventEmitter();c.kill=sig=>{c.signals??=[];c.signals.push(sig);queueMicrotask(()=>c.emit('exit'));};spawned.push({mode:args[1],c});return c;};
  const sync=createSyncProcess({paths:{},origin:'fixture',workspace:'fixture',tokenFile:'fixture',spawn});
  return {sync,spawned};
}
test('actual final sync abort kills its final worker and settles without its normal budget',async()=>{
  const f=syncFixture(),controller=new AbortController();let done=false;
  const result=f.sync.final(8000,{signal:controller.signal}).then(()=>done=true);
  await until(()=>f.spawned.length===1);controller.abort();await sleep(0);
  assert.equal(done,true);assert.ok(f.spawned[0].c.signals?.includes('SIGKILL'));await result;
});
test('actual final sync never spawns after abort during its awaited halt',async()=>{
  const f=syncFixture(),controller=new AbortController();let release;
  f.sync.halt=()=>new Promise(r=>release=r);const result=f.sync.final(100,{signal:controller.signal});
  controller.abort();release();await result;assert.equal(f.spawned.length,0);
});
test('actual final sync rechecks live authority after its awaited halt',async()=>{
  const f=syncFixture();let live=true,release;f.sync.halt=()=>new Promise(r=>release=r);
  const result=f.sync.final(100,{valid:()=>live});live=false;release();await result;assert.equal(f.spawned.length,0);
});
test('actual final worker stops writing on abort before its export budget elapses',async t=>{
  const os=await import('node:os');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vibyra-final-abort-'));
  const worker=path.join(dir,'worker.mjs'),writes=path.join(dir,'writes'),pidFile=path.join(dir,'pid');
  await fs.writeFile(worker,`import fs from'node:fs';fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(writes)},'write\\n'),5);`);
  let pid;const alive=()=>{if(!pid)return false;try{process.kill(-pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
  t.after(async()=>{if(alive())process.kill(-pid,'SIGKILL');await until(()=>!alive());await fs.rm(dir,{recursive:true,force:true});});
  const controller=new AbortController();let done=false;
  const sync=createSyncProcess({paths:{home:dir},origin:'fixture',workspace:'fixture',tokenFile:'fixture',worker});
  const result=sync.final(8000,{signal:controller.signal}).then(()=>done=true);
  for(let n=0;n<100;n++){pid=Number(await fs.readFile(pidFile,'utf8').catch(()=>0));if(pid&&(await fs.stat(writes).catch(()=>null)))break;await sleep(5);}
  assert.ok(pid);const start=Date.now();controller.abort();await until(()=>done&&!alive());
  const snapshot=await fs.readFile(writes,'utf8');await sleep(80);assert.equal(await fs.readFile(writes,'utf8'),snapshot);
  assert.ok(Date.now()-start<1000);await result;
});
