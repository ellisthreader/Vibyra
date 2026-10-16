import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
const source=process.env.P06_RUNTIME_SOURCE?pathToFileURL(path.resolve(process.env.P06_RUNTIME_SOURCE)+'/'):new URL('../src/',import.meta.url);
const {gracefulStop,STOP_GRACE_MS}=await import(new URL('graceful-stop.mjs',source));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function computerFixture(pending){
  const events=[];let alive=true,release;const held=new Promise(r=>release=r);let clock=0;
  const sync={boot:async()=>{},settle:()=>{events.push('settle');return pending==='settle'?held:Promise.resolve();},halt:async()=>{events.push('halt');},final:async()=>{events.push('final');}};
  const context=vm.createContext({process:{getuid:()=>501,getgid:()=>20},AbortController,Promise,setInterval:()=>({unref(){}}),clearInterval:()=>{},setTimeout:()=>({unref(){}})});
  const deps={
    './agent-slots.mjs':{AGENT_SLOTS:0,agentSlot:()=>({runs:'/task/runs',home:'/task/agent-home'})},
    './agents.mjs':{startAgents:()=>({stop:()=>{events.push('agents');return pending==='agents'?held:Promise.resolve();}})},
    './graphical-session.mjs':{startGraphicalSession:()=>{}},
    'node:fs/promises':{default:{mkdir:async()=>{},chmod:async()=>{},rm:async()=>events.push('removed-token')}},'node:path':{default:path},
    './computer-paths.mjs':{PATHS:{},PROJECT_UID:1001,PROJECT_GID:1001,ACTIVITY_SECONDS:15},
    './credential-proxy.mjs':{startCredentialProxy:async()=>({close:async()=>events.push('closed-proxy')}),apiCredential:()=>{}},
    './host-process.mjs':{hostArgs:()=>[],hostEnv:()=>({}),writeTokenFile:async()=>{},HostSupervisor:class{start(){}signal(){events.push('term');alive=false;}kill(){events.push('kill');alive=false;}groupAlive(){return alive;}}},
    './graceful-stop.mjs':{gracefulStop,STOP_GRACE_MS},'./safe-dirs.mjs':{ensureOwnedDir:async()=>{},realOps:{}},
    './projects.mjs':{drainProjects:async()=>{},githubUrl:()=>{}},'./sync-process.mjs':{createSyncProcess:()=>sync},
    './sync-loop.mjs':{FINAL_BUDGET_MS:8000,APPLY_GRACE_MS:15000},
  };
  const module=new vm.SourceTextModule(await fs.readFile(new URL('computer.mjs',source),'utf8'),{context});
  await module.link(spec=>{const exports=deps[spec];assert.ok(exports,spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();
  const computer=await module.namespace.runComputer({client:{token:'fixture'},lease:{active:()=>true},scope:{workspace:'fixture'},bootstrap:{cloudAgents:{enabled:true}},apiOrigin:'fixture',heartbeat:async()=>{},isStopping:()=>false,sync,
    paths:{home:'/task/home',hostState:'/task/host',projects:'/task/projects',run:'/task/run',agentBin:'/task/bin'},exec:async()=>0,sleep:async ms=>{clock+=ms;},now:()=>clock});
  return {computer,events,release};
}
for(const pending of ['agents','settle'])test(`actual computer expiry bypasses pending ${pending} and never resumes final sync`,async()=>{
  const f=await computerFixture(pending),controller=new AbortController();let done=false;
  const shutdown=f.computer.shutdown({signal:controller.signal}).then(()=>done=true);
  await sleep(0);assert.ok(f.events.includes(pending));controller.abort();await sleep(0);
  assert.equal(done,true);assert.ok(f.events.includes('kill'));assert.ok(f.events.includes('removed-token'));assert.ok(f.events.includes('closed-proxy'));
  assert.equal(f.events.includes('final'),false);f.release();await shutdown;await sleep(0);assert.equal(f.events.includes('final'),false);
});
