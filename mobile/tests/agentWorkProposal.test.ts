import test from 'node:test';import assert from 'node:assert/strict';
import {WorkProposalStore} from '../src/agents/v2/workProposalStore';
import {proposalReview,type WorkProposal,type ProposalApi} from '../src/agents/v2/workProposalModel';
import {workProposalClient} from '../src/agents/v2/workProposalClient';
const row=():WorkProposal=>({id:'p',agentId:'a',runId:'r',runtimeId:'runtime',runtime:{accountLabel:'Owner Claude'},kind:'skill',title:'Review',spec:{name:'Review',instructions:'<script>untrusted</script>',assignToAgent:true},revision:2,reviewHash:'exact-reviewed-content',status:'draft',expiresAt:'2026-12-01',activation:null,createdAt:'',updatedAt:''});
const api=(patch:Partial<ProposalApi>={}):ProposalApi=>({list:async()=>[row()],get:async()=>row(),edit:async(p,spec)=>({...p,spec,revision:p.revision+1,reviewHash:'new-hash'} as WorkProposal),accept:async p=>({...p,status:'accepted'}),discard:async p=>({...p,status:'discarded'}),...patch});
test('a changed review never activates and needs same-ID readback',async()=>{
 let accepts=0;const store=new WorkProposalStore(api({get:async()=>({...row(),revision:3}),accept:async p=>{accepts++;return p;}}),row());await store.accept();assert.equal(accepts,0);assert.equal(store.snapshot().unknown,true);await store.refresh();assert.equal(store.snapshot().item.revision,3);assert.equal(store.snapshot().unknown,false);
});
test('editing locks activation and saving replaces full review hash',async()=>{
 let accepts=0;const store=new WorkProposalStore(api({accept:async p=>{accepts++;return p;}}),row());store.edit({name:'Changed',instructions:'new',assignToAgent:false});await store.accept();assert.equal(accepts,0);await store.save();assert.equal(store.snapshot().item.reviewHash,'new-hash');assert.equal(store.snapshot().editing,false);
});
test('lost activation is never blindly replayed and runtime mismatch is rejected',async()=>{
 let writes=0;const store=new WorkProposalStore(api({accept:async()=>{writes++;throw Error('lost');}}),row());await store.accept();await store.accept();await store.discard();assert.equal(writes,1);assert.equal(store.snapshot().unknown,true);
 const other=new WorkProposalStore(api({get:async()=>({...row(),runtimeId:'another'})}),row());await other.refresh();assert.match(other.snapshot().error,/different task or account/);
});
test('proposal request sends displayed revision/hash and complete text remains data',async()=>{
 const calls:unknown[]=[];const client=workProposalClient(async(path,body,method)=>{calls.push({path,body,method});return {proposal:row()} as never;});await client.accept(row());assert.deepEqual(calls,[{path:'agents/v2/proposals/p/accept',body:{revision:2,reviewHash:'exact-reviewed-content'},method:undefined}]);assert.equal(proposalReview(row()).find(r=>r.label==='Instructions')?.text,'<script>untrusted</script>');
});
