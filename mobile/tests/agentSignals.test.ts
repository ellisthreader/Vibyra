import test from 'node:test';import assert from 'node:assert/strict';
import {checkedDigest,clockMinute,findingLink,type SignalsApi,type SignalsPage,type ProjectFinding} from '../src/agents/v2/signalsModel';
import {SignalsStore} from '../src/agents/v2/signalsStore';import {signalsClient} from '../src/agents/v2/signalsClient';
const ID='550e8400-e29b-41d4-a716-446655440000';
const page=():SignalsPage=>({enabled:true,preferences:{revision:1,mode:'daily',timezone:'UTC',quietStart:null,quietEnd:null,digestMinute:540},onboarding:{revision:0,interests:[],dismissed:false,suggestions:[]},watches:[],findings:[],digests:[],connections:[]});
const api=():SignalsApi=>({read:async()=>page(),preferences:async x=>x,onboarding:async(_,x)=>x,watch:async()=>{throw Error('none');},dismiss:async()=>{},acknowledge:async()=>{},digest:async()=>{throw Error('none');}});
test('settings use exact CAS and lost responses lock further writes',async()=>{
 const calls:unknown[]=[];const client=signalsClient(async(path,body,method)=>{calls.push({path,body,method});return {preferences:page().preferences} as never;});await client.preferences(page().preferences);assert.deepEqual(calls,[{path:'agents/v2/signals/preferences',body:{expectedRevision:1,mode:'daily',timezone:'UTC',quietStart:null,quietEnd:null,digestMinute:540},method:'PUT'}]);
 const store=new SignalsStore(api(),'a');await store.refresh();let writes=0;await store.mutate(async()=>{writes++;throw Error('lost');});await store.mutate(async()=>{writes++;});assert.equal(writes,1);assert.equal(store.snapshot().unknown,true);await store.refresh();assert.equal(store.snapshot().unknown,false);
});
test('summary task links reject malformed or swapped summaries',()=>{
 const digest={id:ID,notificationId:ID,date:'2026-10-08',timezone:'UTC',createdAt:'',read:false,items:[{notificationId:ID,agentId:ID,runId:ID,conversationId:ID,kind:'completed',title:'Finished',createdAt:''}]};assert.equal(checkedDigest(digest,ID),digest);assert.throws(()=>checkedDigest(digest,'another'));assert.throws(()=>checkedDigest({...digest,items:[{...digest.items[0],runId:'../../'}]},ID));
});
test('finding links stay on the exact GitHub resource and times validate',()=>{
 const f={source:{provider:'github',repository:'owner/repo',number:8,url:'https://github.com/owner/repo/pull/8'}} as ProjectFinding;assert.equal(findingLink(f),f.source.url);assert.equal(findingLink({...f,source:{...f.source,url:'https://github.com.evil.test/owner/repo/pull/8'}}),null);assert.equal(findingLink({...f,source:{...f.source,url:'https://github.com/owner/other/pull/8'}}),null);assert.equal(clockMinute('23:59'),1439);assert.throws(()=>clockMinute('24:00'));
});
