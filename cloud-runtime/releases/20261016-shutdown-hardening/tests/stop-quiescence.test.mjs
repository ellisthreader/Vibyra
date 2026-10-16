import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
const source=process.env.P06_RUNTIME_SOURCE ? pathToFileURL(path.resolve(process.env.P06_RUNTIME_SOURCE)+'/') : new URL('../src/',import.meta.url);
const { gracefulStop, runCommand, STOP_GRACE_MS, EXPIRY_GRACE_MS } = await import(new URL('graceful-stop.mjs',source));
const { HostSupervisor } = await import(new URL('host-process.mjs',source));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn) {const end=Date.now()+4000;while(Date.now()<end){if(await fn())return;await sleep(10);}throw Error('Synthetic process did not settle');}
async function fixture(t, mode) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vibyra-stop-quiescence-'));
  const writes=path.join(dir,'writes'), script=path.join(dir,'writer.mjs');
  const childScript=path.join(dir,'child.mjs');
  await fs.writeFile(childScript,`import fs from 'node:fs';process.on('SIGTERM',()=>{});fs.appendFileSync(process.argv[2],'child-ready\\n');setInterval(()=>fs.appendFileSync(process.argv[2],'write\\n'),5);`);
  const code=mode.startsWith('descendant')
    ? `import{spawn}from'node:child_process';import fs from'node:fs';spawn(process.execPath,[${JSON.stringify(childScript)},process.argv[2]],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`
    : `import fs from'node:fs';process.on('SIGTERM',()=>{${mode==='clean'?"fs.appendFileSync(process.argv[2],'flushed\\n');process.exit(0);":''}});fs.appendFileSync(process.argv[2],'ready\\n');setInterval(()=>fs.appendFileSync(process.argv[2],'write\\n'),5);`;
  await fs.writeFile(script,code);
  const groups=[];
  const host=new HostSupervisor({bin:process.execPath,args:[script,writes],env:{PATH:process.env.PATH},valid:()=>true,backoffMs:[mode==='descendant-exited'?4000:10],onEvent:event=>{if(event==='start')groups.push(host.child.pid);}});
  host.start(); const child=host.child, group=child.pid, exit=once(child,'exit');
  const groupAlive=()=>{try{process.kill(-group,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
  t.after(async()=>{host.kill();for(const pid of groups){try{process.kill(-pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}await exit;await until(()=>!groupAlive());await fs.rm(dir,{recursive:true,force:true});});
  await until(async()=> (await fs.readFile(writes,'utf8').catch(()=>'' )).includes('write'));
  if(mode==='descendant-exited'){process.kill(group,'SIGTERM');await exit;assert.equal(host.running,false);assert.equal(groupAlive(),true);}
  return {host,exit,writes,groups};
}
for(const mode of ['clean','stubborn','descendant','descendant-exited']) {
  test(`real ${mode} writer is quiescent before the final snapshot`,async t=>{
    const f=await fixture(t,mode);let snapshot;
    await gracefulStop({host:f.host,userUid:null,graceMs:40,tickMs:5,exec:async()=>0,
      finalSync:async()=>{assert.equal(f.host.groupAlive(),false);snapshot=await fs.readFile(f.writes,'utf8');await sleep(80);assert.equal(await fs.readFile(f.writes,'utf8'),snapshot);}});
    await f.exit;assert.equal(await fs.readFile(f.writes,'utf8'),snapshot);assert.equal(f.host.starts,1);
    f.host.signal('SIGTERM');f.host.kill();assert.equal(f.host.groupAlive(),false);
    if(mode==='clean')assert.match(snapshot,/flushed/);
  });
}
test('restart retains the old surviving group and stops both generations',async t=>{
  const f=await fixture(t,'descendant');const first=f.host.child;
  process.kill(first.pid,'SIGTERM');await f.exit;
  await until(()=>f.groups.length===2);
  await until(async()=> (await fs.readFile(f.writes,'utf8')).split('child-ready').length===3);
  let snapshot;
  await gracefulStop({host:f.host,userUid:null,graceMs:40,tickMs:5,exec:async()=>0,
    finalSync:async()=>{assert.equal(f.host.groupAlive(),false);snapshot=await fs.readFile(f.writes,'utf8');await sleep(80);}});
  assert.equal(await fs.readFile(f.writes,'utf8'),snapshot);assert.equal(f.host.starts,2);
  f.host.kill();f.host.signal('SIGTERM');assert.equal(f.host.groupAlive(),false);
});
test('a process surviving the hard-stop budget refuses final sync',async()=>{
  let now=0,finals=0,kills=0;
  await assert.rejects(gracefulStop({host:{signal(){},groupAlive:()=>true,kill(){kills++;}},graceMs:5,now:()=>now,sleep:async ms=>{now+=ms;},tickMs:5,exec:async()=>0,finalSync:async()=>{finals++;}}),/did not stop/);
  assert.equal(finals,0);assert.ok(kills>0);assert.ok(now<=1005);
});
test('an unknown process probe never counts as absence',async()=>{
  let now=0,finals=0;
  await assert.rejects(gracefulStop({userUid:123456,graceMs:5,now:()=>now,sleep:async ms=>{now+=ms;},exec:async cmd=>cmd.endsWith('pgrep')?-1:0,finalSync:async()=>{finals++;}}),/did not stop/);
  assert.equal(finals,0);assert.ok(now<=2005); // 1 s refusal observation plus the separate 1 s cleanup sweep.
});
test('a failed process command is distinct from pgrep no-match',async()=>{
  assert.equal(await runCommand('/nonexistent-vibyra-p06-command',[]),-1);
  assert.equal(await runCommand(process.execPath,['-e','process.exit(1)']),1);
});
test('final-sync failure still performs the existing cleanup',async()=>{
  let kills=0;await gracefulStop({host:{signal(){},groupAlive:()=>false,kill(){kills++;}},exec:async()=>0,finalSync:async()=>{throw Error('synthetic upload failure');}});assert.equal(kills,1);
});
test('grace and expiry policy values remain unchanged',()=>{assert.equal(STOP_GRACE_MS,10000);assert.equal(EXPIRY_GRACE_MS,5000);});
