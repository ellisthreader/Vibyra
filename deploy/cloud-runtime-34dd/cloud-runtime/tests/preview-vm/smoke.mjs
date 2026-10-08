// Run only on a dedicated temporary VM. No customer/backend credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startGraphicalSession} from '/opt/vibyra/src/graphical-session.mjs';
import {EgressLimit,egressCounter} from '/opt/vibyra/src/egress-limit.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
assert.equal(process.getuid(),0);const run='/run/vibyra';
await fs.mkdir(run,{recursive:true});await fs.chmod(run,0o750);await fs.chown(run,0,1001);
await fs.mkdir('/data/home',{recursive:true});await fs.chown('/data/home',1001,1001);
let displayDiagnostic='';
const tracedSpawn=(bin,args,opts)=>{const child=spawn(bin,args,{...opts,stdio:['ignore','ignore','pipe']});child.stderr.on('data',data=>{displayDiagnostic=(displayDiagnostic+bin+': '+data).slice(-6000);});return child;};
let valid=true,failed=0;const graphical=await startGraphicalSession({run,uid:1001,gid:1001,valid:()=>valid,onFailure:()=>failed++,spawn:tracedSpawn});
const env=graphical.env;
console.log('Private display ready',graphical.healthy());
try {
  // Prove installed SDKs compile and launch software as the project user.
  await exec('/usr/local/bin/rustc',['--version'],{uid:1001,gid:1001,env,timeout:5000});
  await fs.writeFile('/tmp/project/qa-sdk.rs','fn main(){println!("SDK ready");}');
  await exec('/usr/local/bin/rustc',['/tmp/project/qa-sdk.rs','-o','/tmp/project/qa-sdk'],{uid:1001,gid:1001,env,timeout:15000});
  assert.match((await exec('/tmp/project/qa-sdk',[],{uid:1001,gid:1001,env})).stdout,/SDK ready/);
  const qt='#include <QApplication>\n#include <QPushButton>\n#include <QTimer>\nint main(int c,char**v){QApplication a(c,v);QPushButton b("Vibyra Qt fixture");b.resize(320,240);b.show();QTimer::singleShot(500,&a,&QApplication::quit);return a.exec();}';
  await fs.writeFile('/tmp/project/qa-qt.cpp',qt);
  const flags=(await exec('/usr/bin/pkg-config',['--cflags','--libs','Qt6Widgets'],{uid:1001,gid:1001,env})).stdout.trim().split(/\s+/);
  await exec('/usr/bin/g++',['/tmp/project/qa-qt.cpp','-o','/tmp/project/qa-qt',...flags],{uid:1001,gid:1001,env,timeout:15000});
  await exec('/tmp/project/qa-qt',[],{uid:1001,gid:1001,env,timeout:5000});
  await exec('/usr/bin/php',['--version'],{uid:1001,gid:1001,env,timeout:5000});
  console.log('PASS actual non-root Rust compile/run, Qt compile/window launch and PHP SDK');
  for(let i=0;i<5;i++) {
    await fs.rm('/tmp/project/preview-ready',{force:true});await fs.rm('/tmp/project/preview-input',{force:true});
    const app=spawn('/usr/bin/python3',['/opt/qa/native-fixture.py'],{uid:1001,gid:1001,env,stdio:['ignore','ignore','pipe']});
    let diagnostic='';app.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-4000);});
    try {
      for(let n=0;n<500 && app.exitCode===null && !await fs.stat('/tmp/project/preview-ready').catch(()=>null);n++) await delay(30);
      assert.ok(await fs.stat('/tmp/project/preview-ready').catch(()=>null),'Native readiness failed: '+diagnostic+' display: '+displayDiagnostic);
      const result=await exec('/usr/bin/python3',['/opt/qa/capture-input.py'],{uid:1001,gid:1001,env,timeout:5000});
      assert.match(result.stdout,/PASS actual native/);
    } finally {if(app.exitCode===null&&app.signalCode===null){app.kill('SIGKILL');await new Promise(r=>app.once('exit',r));}}
  }
  // Website workloads run as the same unprivileged project user.
  const server=spawn(process.execPath,['-e',`require('http').createServer((q,r)=>{if(q.url==='/form'&&q.method==='POST')r.writeHead(303,{location:'/saved','set-cookie':'session=fixture; HttpOnly'});r.end(q.url==='/saved'?'saved': 'site ready')}).listen(3488,'127.0.0.1')`],{uid:1001,gid:1001,env,stdio:'ignore'});
  try {
    await delay(250);assert.equal(await(await fetch('http://127.0.0.1:3488/')).text(),'site ready');
    const response=await fetch('http://127.0.0.1:3488/form',{method:'POST',body:'changed',redirect:'manual'});
    assert.equal(response.status,303);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
    assert.equal(await(await fetch('http://127.0.0.1:3488/saved')).text(),'saved');
  }finally {server.kill('SIGKILL');await new Promise(r=>server.once('exit',r));}
  const quota=new EgressLimit();await quota.apply({bytes:2097152},await egressCounter());
  const rules=(await exec('/usr/sbin/nft',['list','table','inet','vibyra_preview_egress'])).stdout;
  assert.match(rules,/skuid 1001/);assert.match(rules,/quota over/);
  await exec('/usr/bin/curl',['--max-time','5','-I','https://docs.fly.io'],{uid:1001,gid:1001,env,timeout:7000});
  await quota.apply({bytes:0},await egressCounter());
  const blocked=await exec('/usr/bin/curl',['--max-time','2','-I','https://docs.fly.io'],{uid:1001,gid:1001,env,timeout:4000}).then(()=>false,()=>true);
  assert.equal(blocked,true);await exec('/usr/sbin/nft',['delete','table','inet','vibyra_preview_egress']);
  valid=false;for(let i=0;i<30 && graphical.healthy();i++)await delay(100);
  assert.equal(graphical.healthy(),false);assert.equal(failed,1);
  // healthy becomes false before asynchronous child exit/directory cleanup completes.
  for(let i=0;i<30 && await fs.stat(run+'/display').catch(()=>null);i++)await delay(100);
  assert.equal(await fs.stat(run+'/display').catch(()=>null),null);
  console.log('PASS 5 native start/capture/click/type/stop cycles; website/form/redirect; kernel network quota; lease-loss display cleanup');
}finally{await graphical.stop();}
