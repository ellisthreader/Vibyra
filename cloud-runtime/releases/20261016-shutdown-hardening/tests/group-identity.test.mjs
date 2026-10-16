import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {HostSupervisor}=await import(pathToFileURL(path.resolve(process.env.STOP_REVIEW_SOURCE,'host-process.mjs')));
function rig(t) {
 const original=process.kill,calls=[];let absent=false,valid=true,pid=800001;
 const children=[];
 process.kill=(target,signal)=>{calls.push({target,signal});if(signal===0&&absent)throw Object.assign(Error('gone'),{code:'ESRCH'});return true;};
 const host=new HostSupervisor({bin:'synthetic',args:[],env:{},valid:()=>valid,spawn:()=>{const child=new EventEmitter();child.pid=pid++;child.kill=signal=>{calls.push({target:child.pid,signal,fallback:true});};children.push(child);return child;}});
 t.after(()=>{host.kill();process.kill=original;});
 return {host,calls,children,absent:value=>{absent=value;},valid:value=>{valid=value;}};
}
test('a positively absent group is never signalled again through the stale leader object',t=>{
 const r=rig(t);r.host.start();r.host.signal('SIGTERM');r.absent(true);assert.equal(r.host.groupAlive(),false);
 r.calls.length=0;r.absent(false); // OS may now recycle the old numeric group identifier.
 r.host.kill();assert.deepEqual(r.calls,[],'absence must retire the handle even before delayed child exit event');
});
test('stop followed by explicit restart must also kill the new process group',t=>{
 const r=rig(t);r.host.start();r.host.kill();r.host.start();const pid=r.host.child.pid;r.calls.length=0;r.host.kill();
 assert.ok(r.calls.some(c=>c.target===-pid&&c.signal==='SIGKILL'),'old stop bookkeeping must not hide the new child');
});
test('leader exit before stop retains the outstanding child process group',t=>{
 const r=rig(t);r.host.start();r.valid(false);r.children[0].emit('exit',0);assert.equal(r.host.running,false);
 assert.equal(r.host.groupAlive(),true,'group is still alive after leader exit');r.calls.length=0;r.host.signal('SIGTERM');
 assert.ok(r.calls.some(c=>c.target===-r.children[0].pid&&c.signal==='SIGTERM'));
});
