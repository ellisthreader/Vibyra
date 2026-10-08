import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkCoreStore } from '../src/agents/v2/workCoreStore';
import { workCoreClient } from '../src/agents/v2/workCoreClient';
import { workControls,followUpWhen,ownedWork,type AgentGoal,type WorkCoreApi } from '../src/agents/v2/workCoreModel';
const goal=():AgentGoal=>({id:'goal',agentId:'agent',title:'Launch',revision:2,status:'active',reason:null,runtimeId:'runtime',runtime:{executionTarget:'cloud',provider:'claude',model:'opus'},expiresAt:'2026-12-01T12:00:00Z',createdAt:'',updatedAt:'',milestones:[],progress:{delivered:0,total:2}});
const api=(patch:Partial<WorkCoreApi>={}):WorkCoreApi=>({goals:async()=>[goal()],goal:async()=>goal(),followups:async()=>[],followup:async()=>{throw Error('none');},sources:async()=>[],controlGoal:async item=>({...item,revision:item.revision+1,status:'paused'}),confirmGoal:async item=>({...item,status:'completed'}),controlFollowup:async item=>item,...patch});
test('work mutations send displayed revisions and exact resource paths',async()=>{
 const calls:unknown[]=[];const client=workCoreClient(async(path,body,method)=>{calls.push({path,body,method});return {goal:goal(),goals:[goal()],sources:[]} as never;});
 await client.goals('agent');await client.controlGoal(goal(),'pause');await client.confirmGoal(goal());await client.sources('agent');
 assert.deepEqual(calls,[{path:'agents/v2/goals?agentId=agent',body:undefined,method:undefined},{path:'agents/v2/goals/goal/control',body:{revision:2,action:'pause'},method:undefined},{path:'agents/v2/goals/goal/confirm',body:{revision:2},method:undefined},{path:'agents/v2/followups/sources?agentId=agent',body:undefined,method:undefined}]);
});
test('unknown work write refuses a duplicate mutation until a successful read',async()=>{
 let writes=0;const store=new WorkCoreStore(api({controlGoal:async()=>{writes++;throw Error('lost response');}}),'agent');
 await store.refresh();await store.goal(goal(),'pause');await store.goal(goal(),'pause');assert.equal(writes,1);assert.equal(store.snapshot().unknown,true);
 await store.refresh();assert.equal(store.snapshot().unknown,false);await store.goal(goal(),'pause');assert.equal(writes,2);
});
test('late read cannot populate an unmounted account and foreign rows fail closed',async()=>{
 let resolve!:(value:AgentGoal[])=>void;const store=new WorkCoreStore(api({goals:()=>new Promise(r=>{resolve=r;})}),'agent');
 const pending=store.refresh();store.dispose();resolve([goal()]);await pending;assert.deepEqual(store.snapshot().goals,[]);
 assert.throws(()=>ownedWork([{...goal(),agentId:'other'}],'agent'));
 const wrong=new WorkCoreStore(api({goals:async()=>[{...goal(),agentId:'other'}]}),'agent');await wrong.refresh();assert.deepEqual(wrong.snapshot().goals,[]);assert.match(wrong.snapshot().error,/different teammate/);
});
test('completed goals never offer progress controls; absence wording does not claim mailbox knowledge',()=>{
 assert.deepEqual(workControls('completed'),[]);assert.deepEqual(workControls('paused'),['resume','cancel']);assert.deepEqual(workControls('awaiting_review'),['cancel']);
 assert.match(followUpWhen({kind:'absence',triggerId:'t',triggerRevision:1,subject:'thread123',at:'2026-12-01T12:00:00Z'}),/no matching verified event/);
});
