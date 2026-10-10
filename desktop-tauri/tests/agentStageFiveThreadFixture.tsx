import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {Thread} from '../src/components/teammates/Thread';
import {useAccountStore} from '../src/state/accountStore';
import type {Teammate} from '../src/components/teammates/types';
import type {Run} from '../../mobile/src/agents/v2/runCore';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const agent:Teammate={id:id(1),chatId:id(2),name:'Launch assistant',brief:'Handle independent tasks.',revision:1,avatar:'review',budget:5,memory:'',integrations:[],archived:false,status:'idle',lastMessage:'',updatedAt:'',lastRunId:null};
useAccountStore.setState({snapshot:{status:'signedIn',profile:{email:'stage5@example.test'},secureStorage:true} as any});
let runs:Run[]=[],reject=false;const events:string[]=[];
Object.assign(window,{stageFiveEvents:events,completeJob:(index:number)=>{runs=runs.map((r,i)=>i===index?{...r,state:'completed',terminal:true,answer:`Synthetic result for ${r.prompt}. Other jobs remain independent.`}:r);},rejectNext:()=>{reject=true;}});
mockIPC(async(command,args:any)=>{
 if(command!=='teammate_request'&&command!=='teammate_request_device')return null;
 const {path,body}=args;
 if(path==='vibes/wallet')return {wallet:{consented:true}};if(path==='vibes/models')return {models:[]};if(path.startsWith('vibes/chats/'))return {turns:[],hasMore:false};
 if(path==='agents/v2/cloud')return {enabled:false,policy:null,accounts:[],computer:null,requiresSetup:true};
 if(path.startsWith('agents/v2/jobs?')){const key=new URLSearchParams(path.split('?')[1]).get('idempotencyKey');return {enabled:true,runs:key?runs.filter(r=>r.idempotencyKey===key):runs.slice().reverse(),capacity:{running:runs.filter(r=>!r.terminal).length,maxRunning:3,queued:0,maxQueued:24}};}
 if(path==='agents/v2/runs'&&body){events.push(`admit:${body.prompt}:${body.executionMode}`);if(reject){reject=false;throw '429: Your job queue is full.';}let run=runs.find(r=>r.idempotencyKey===body.idempotencyKey);if(!run){run={id:id(100+runs.length),agentId:agent.id,conversationId:agent.chatId,conversationSeq:runs.length+1,idempotencyKey:body.idempotencyKey,prompt:body.prompt,state:'running',stateReason:null,terminal:false,answer:null,eventCursor:0,createdAt:new Date(Date.now()+runs.length).toISOString(),actions:[],runtime:{provider:'claude',model:'claude-sonnet-4-6'},job:{mode:'independent',queueReason:null,slot:runs.length as 0|1|2}};runs.push(run);}return {run};}
 if(path.startsWith('agents/v2/runs?'))return {runs:runs.slice().reverse()};
 const match=/^agents\/v2\/runs\/([^/?]+)(.*)$/.exec(path);if(match){const run=runs.find(r=>r.id===match[1])!;if(match[2]==='/cancel'){events.push(`cancel:${run.id}`);Object.assign(run,{state:'cancelled',terminal:true});return {run};}if(match[2].startsWith('/events'))return {events:[],nextCursor:0,latestSeq:0,state:run.state,terminal:run.terminal};return {run:{...run,instructionRevision:0,appliedInstructionRevision:0,instructions:[]}};}
 if(path.endsWith('/outputs'))return {outputs:[]};if(path.startsWith('agents/v2/proposals'))return {proposals:[]};if(path==='agents/v2/connections')return {connections:[]};if(path.includes('/grants'))return {grants:[]};if(path==='connectors')return {enabled:true,integrations:[]};if(path.includes('/plan')||path.includes('/preview'))return {plan:{}};if(path.endsWith('/read'))return {ok:true};throw `404: Unsupported fixture route ${path}`;
});
createRoot(document.getElementById('root')!).render(<div style={{display:'flex',height:'100vh',width:'100%'}}><Thread agent={agent} identity="stage5@example.test" active enabled v2 onDetails={()=>{}} onBack={()=>{}} onRead={()=>{}} onAccess={()=>{}} onReload={()=>{}}/></div>);
