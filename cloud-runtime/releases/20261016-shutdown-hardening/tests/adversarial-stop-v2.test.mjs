import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {gracefulStop,runCommand}=await import(pathToFileURL(path.resolve(process.env.STOP_REVIEW_SOURCE,'graceful-stop.mjs')));
const receipts=[];
const rig=()=>{let clock=0;return {now:()=>clock,sleep:async ms=>{clock+=ms;},advance:ms=>{clock+=ms;},time:()=>clock};};
test('a detached UID writer ignoring TERM is killed before final snapshot',async()=>{
 const c=rig();let alive=true,finals=0;const events=[];
 await gracefulStop({host:{signal(){events.push('host-term');},kill(){events.push('host-kill');},groupAlive:()=>false},userUid:987654,graceMs:5,tickMs:5,now:c.now,sleep:c.sleep,
 exec:async(cmd,args)=>{if(cmd.endsWith('pkill')){events.push(args[0]);if(args[0]==='-KILL')alive=false;}return cmd.endsWith('pgrep')?(alive?0:1):0;},
 finalSync:async()=>{events.push('final');finals++;assert.equal(alive,false);}});
 assert.equal(finals,1);assert.ok(events.indexOf('-KILL')<events.indexOf('final'));receipts.push({case:'detached-uid',events});
});
test('a group permission/probe error never certifies absence',async()=>{
 const c=rig();let finals=0;
 await assert.rejects(gracefulStop({host:{signal(){},kill(){},groupAlive(){throw Object.assign(Error('unknown group'),{code:'EPERM'});}},graceMs:5,now:c.now,sleep:c.sleep,exec:async()=>1,finalSync:async()=>{finals++;}}));
 assert.equal(finals,0);
});
for(const status of [-1,2,127])test(`UID probe status ${status} refuses final snapshot`,async()=>{
 const c=rig();let finals=0;
 await assert.rejects(gracefulStop({userUid:987654,graceMs:5,now:c.now,sleep:c.sleep,exec:async cmd=>cmd.endsWith('pgrep')?status:0,finalSync:async()=>{finals++;}}));assert.equal(finals,0);
});
test('failed probe can recover only after a hard stop and positive no-match',async()=>{
 const c=rig();let killed=false,finals=0;
 await gracefulStop({userUid:987654,graceMs:5,now:c.now,sleep:c.sleep,exec:async(cmd,args)=>{if(cmd.endsWith('pkill')&&args[0]==='-KILL')killed=true;return cmd.endsWith('pgrep')?(killed?1:-1):0;},finalSync:async()=>{assert.equal(killed,true);finals++;}});assert.equal(finals,1);
});
test('cleanup reaps a final snapshot worker after its parent has returned',async()=>{
 const c=rig();let alive=false,kills=0;
 await gracefulStop({userUid:987654,graceMs:5,now:c.now,sleep:c.sleep,exec:async(cmd,args)=>{if(cmd.endsWith('pkill')&&args[0]==='-KILL'){alive=false;kills++;}return cmd.endsWith('pgrep')?(alive?0:1):0;},finalSync:async()=>{alive=true;}});assert.equal(alive,false);assert.ok(kills>=1);
});
test('failed probes and cleanup share bounded command deadlines',async()=>{
 const c=rig();let finals=0;
 await assert.rejects(gracefulStop({host:{signal(){},kill(){},groupAlive:()=>true},userUid:987654,graceMs:0,now:c.now,sleep:c.sleep,
 exec:async(cmd,args,options)=>{c.advance(options?.timeoutMs??4000);return cmd.endsWith('pgrep')?0:0;},finalSync:async()=>{finals++;}}));
 assert.equal(finals,0);assert.ok(c.time()<=3100,`stop took ${c.time()} simulated ms`);receipts.push({case:'all-command-timeouts-and-survivor',simulatedTotalMs:c.time(),finding:'initial TERM1000ms +hard observation1000ms +cleanup1000ms, plus <=2ms budget rounding'});
});
test('command timeout is distinguishable from legitimate pgrep no-match',async()=>{
 assert.equal(await runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:20}),-1);
 assert.equal(await runCommand(process.execPath,['-e','process.exit(1)'],{timeoutMs:1000}),1);
});
test.after(async()=>{if(process.env.STOP_REVIEW_RECEIPT)await fs.writeFile(process.env.STOP_REVIEW_RECEIPT,JSON.stringify(receipts,null,2)+'\n');});

test('an already expired stop never begins final export',async()=>{
 const controller=new AbortController();controller.abort();let finals=0;
 await gracefulStop({host:{signal(){},kill(){},groupAlive:()=>false},signal:controller.signal,graceMs:10000,exec:async()=>0,finalSync:async()=>{finals++;}});assert.equal(finals,0);
});
