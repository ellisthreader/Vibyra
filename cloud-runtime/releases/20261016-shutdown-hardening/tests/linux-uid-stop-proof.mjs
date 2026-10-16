import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
assert.equal(process.platform,'linux','Private Linux VM only');
assert.equal(process.getuid(),0,'Runner must remain root');
assert.equal(process.env.P06_PRIVATE_VM,'1','Requires explicit private no-owner VM acknowledgement');
const source=path.resolve(process.env.P06_RUNTIME_SOURCE??'/opt/vibyra/src');
const {gracefulStop,runCommand}=await import(pathToFileURL(path.join(source,'graceful-stop.mjs')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pids=()=>{try{return execFileSync('/usr/bin/pgrep',['-u','1001'],{encoding:'utf8',timeout:1000,killSignal:'SIGKILL'}).trim().split('\n').map(Number);}catch(error){if(error.status===1)return[];throw error;}};
assert.deepEqual(pids(),[],'Refuse to signal UID1001 if any pre-existing process exists');
const results=[];
for(const mode of ['clean','stubborn']){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vibyra-p06-private-uid-'));
  await fs.chmod(dir,0o755);const script=path.join(dir,'writer.mjs'),file=path.join(dir,'writes');
  await fs.writeFile(file,'');await fs.chown(file,1001,1001);await fs.chmod(file,0o600);
  await fs.writeFile(script,`import fs from'node:fs';if(process.getuid()!==1001)process.exit(3);process.on('SIGTERM',()=>{${mode==='clean'?"fs.appendFileSync(process.argv[2],'flushed\\n');process.exit(0);":''}});fs.appendFileSync(process.argv[2],'ready\\n');setInterval(()=>fs.appendFileSync(process.argv[2],'write\\n'),5);`);
  const child=spawn(process.execPath,[script,file],{uid:1001,gid:1001,detached:true,stdio:'ignore',env:{PATH:'/usr/bin:/bin'}});
  const exit=once(child,'exit');const commands=[];let snapshot,atSnapshot,afterUpload;
  try{
    const readyDeadline=Date.now()+3000;while(!(await fs.readFile(file,'utf8')).includes('write')){assert.ok(Date.now()<readyDeadline,'writer ready');await sleep(10);}
    assert.deepEqual(pids(),[child.pid],'Only this task-owned UID1001 writer may be signalled');
    await gracefulStop({userUid:1001,host:null,graceMs:40,tickMs:5,
      exec:async(cmd,args,options)=>{const code=await runCommand(cmd,args,options);commands.push({cmd,args,code});return code;},
      finalSync:async()=>{atSnapshot=pids();snapshot=await fs.readFile(file,'utf8');await sleep(80);afterUpload=await fs.readFile(file,'utf8');}});
    await exit;const finalBytes=await fs.readFile(file,'utf8');
    assert.ok(snapshot,'final snapshot ran');assert.deepEqual(atSnapshot,[],'snapshot requires observed UID absence');
    assert.equal(afterUpload,snapshot,'no writes during upload');assert.equal(finalBytes,snapshot,'no writes after snapshot');
    assert.deepEqual(pids(),[],'no UID1001 survivor');assert.ok(commands.some(c=>c.cmd.endsWith('pgrep')&&c.code===1));
    if(mode==='clean')assert.match(snapshot,/flushed/);
    results.push({mode,runnerUid:process.getuid(),writerUid:1001,snapshotBytes:Buffer.byteLength(snapshot),postSnapshotBytes:Buffer.byteLength(finalBytes)-Buffer.byteLength(snapshot),atSnapshot,commands});
  }finally{
    try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    await exit;await fs.rm(dir,{recursive:true,force:true});
  }
}
assert.deepEqual(pids(),[]);console.log(JSON.stringify({ok:true,source,results},null,2));
