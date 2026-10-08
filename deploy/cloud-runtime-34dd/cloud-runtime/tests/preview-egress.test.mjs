import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EgressLimit } from '../src/egress-limit.mjs';
import { Lease } from '../src/lease.mjs';
function firewall(code=0) {
  const calls=[];
  return {calls, spawn(bin,args) {
    const p=new EventEmitter();p.kill=()=>{};p.stdin=new EventEmitter();
    p.stdin.end=rules=>{calls.push({bin,args,rules});queueMicrotask(()=>p.emit('exit',code));};
    return p;
  }};
}
test('network allowance spends only bytes since the signed root counter, and replaces quotas atomically',async()=>{
  let actual=1200;const f=firewall();const n=new EgressLimit({counter:async()=>actual,spawn:f.spawn});
  await n.apply({bytes:1000},1000); assert.match(f.calls[0].rules,/quota over 800 bytes drop/);
  actual=2000;await n.apply({bytes:1000},1000);assert.match(f.calls[1].rules,/delete table inet/);
  assert.match(f.calls[1].rules,/quota over 0 bytes drop/);assert.match(f.calls[0].rules,/meta skuid 1001/);
});
test('invalid or unavailable firewall authority fails closed',async()=>{
  const f=firewall(1);const n=new EgressLimit({counter:async()=>0,spawn:f.spawn});
  for(const value of [null,{bytes:-1},{bytes:2097153},{bytes:1.2},{bytes:'100'}]) await assert.rejects(n.apply(value,0),/Invalid signed/);
  assert.equal(f.calls.length,0);await assert.rejects(n.apply({bytes:1},0),/quota failed/);assert.equal(n.installed,false);
});
test('a signature cannot grant unlimited network or survive a changed VM generation',()=>{
  const keys=generateKeyPairSync('ed25519');const pub=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const lease=new Lease(pub,{workspace:'w',machine:'m',generation:2},()=>1000000);
  const signed=(network,generation=2)=>{const payload=Buffer.from(JSON.stringify({workspace:'w',machine:'m',generation,state:'ready',expires:1020,network})).toString('base64');return {payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64')};};
  lease.accept(signed({bytes:1024}));assert.equal(lease.network.bytes,1024);
  assert.throws(()=>lease.accept(signed({bytes:2097153})),/network lease/);
  assert.throws(()=>lease.accept(signed({bytes:1024},1)),/mismatched/);
});
