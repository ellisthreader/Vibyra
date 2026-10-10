import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useWorkProposals} from '../src/agents/v2/useWorkProposals';
import type {ProposalApi,WorkProposal} from '../src/agents/v2/workProposalModel';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const proposal=(agentId:string,title:string):WorkProposal=>({id:agentId,agentId,runId:agentId,runtimeId:agentId,runtime:{provider:'claude'},
 title,revision:1,reviewHash:'fixture',status:'draft',expiresAt:'2026-12-01T00:00:00Z',activation:null,createdAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:00Z',
 kind:'skill',spec:{name:title,instructions:'Fixture only.',assignToAgent:false}});
function Fixture(){
 const [agent,setAgent]=useState(first),[active,setActive]=useState(true),[calls,setCalls]=useState(0);
 const rows=useRef<Record<string,WorkProposal[]>>({[first]:[],[second]:[proposal(second,'Second teammate draft')]}),hold=useRef(false),pending=useRef<(()=>void)[]>([]);
 const [api]=useState<ProposalApi>(()=>({list:async id=>{setCalls(n=>n+1);const captured=structuredClone(rows.current[id]);
  return hold.current&&id===first?new Promise(resolve=>pending.current.push(()=>resolve(captured))):captured;},
  get:async()=>{throw new Error('Unexpected get');},edit:async()=>{throw new Error('Unexpected edit');},accept:async()=>{throw new Error('Unexpected accept');},discard:async()=>{throw new Error('Unexpected discard');}}));
 const work=useWorkProposals(api,agent,agent,active);
 return <main><output data-testid="state">{work.busy?'busy':'idle'}</output><output data-testid="calls">{calls}</output>
  <output data-testid="items">{work.items.map(x=>x.title).join('|')}</output><output data-testid="error">{work.error}</output>
  <button onClick={()=>{hold.current=true;void work.refresh();}}>Start stale read</button>
  <button onClick={()=>{rows.current[first]=[proposal(first,'Fast task proposal')];setActive(false);}}>Finish quickly</button>
  <button onClick={()=>{hold.current=false;pending.current.splice(0).forEach(resolve=>resolve());}}>Release old response</button>
  <button onClick={()=>{setAgent(second);setActive(true);}}>Switch teammate</button>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
