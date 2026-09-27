import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { useState } from 'react';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { useAccountStore } from '../src/state/accountStore';
import type { Teammate, Turn } from '../src/components/teammates/types';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/project-focus.css';
import '../src/styles/strip.css';
import '../src/styles/teammates.css';
const params = new URLSearchParams(location.search);
if (params.has('light')) document.documentElement.dataset.theme = 'light';
const identity = 'agents-fixture@example.test';
useAccountStore.setState({ snapshot: { status: 'signedIn', profile: { email: identity }, secureStorage: true } as any });
const uid = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
let agents: Teammate[] = ['Website reviewer','On-call engineer'].map((name, i) => ({ id: uid(i + 1), chatId: uid(i + 10), revision: 1, name, brief: i ? 'Investigate incidents, explain the cause, and ask before changing anything.' : 'Review the website for clarity, usability and accessibility. Prioritise practical improvements.', memory: '', avatar: i ? 'oncall' : 'review', model: 'auto', budget: 5, integrations: [], archived: false, status: i ? 'needs_approval' : 'completed', lastMessage: i ? 'A step needs your approval.' : 'I found three small changes that make the page easier to use.', updatedAt: '2026-09-22T15:30:00Z', unread: true }));
let turns: Turn[] = [
 { id: uid(20), chatId: uid(10), prompt: 'Review the homepage and suggest the three most useful improvements.', response: 'The layout is clear and the main action is easy to find. I would start with these three changes:\n\n1. **Explain the outcome** in the headline.\n2. **Increase contrast** on the supporting text.\n3. **Keep one primary action** above the fold.\n\nEach is a small change you can review independently.', status: 'completed', model: 'test/reviewer', error: null, createdAt: '2026-09-22T15:30:00Z' },
 { id: uid(21), chatId: uid(11), prompt: 'Summarise the incident and prepare an issue for the team.', response: 'The failed requests share the same upstream timeout. I have prepared an issue with the evidence and a proposed next step.', status: 'waiting', model: 'test/reviewer', error: null, createdAt: '2026-09-22T15:35:00Z', tools: [{ id: uid(30), operation: 'create_issue', integration: 'github', expiresAt: Date.now() / 1000 + 900, approval: { state: 'pending', fingerprint: 'a'.repeat(64), arguments: { repository: 'vibyra/example', title: 'Investigate upstream timeout', body: 'Review the timeout logs and verify retry behaviour.' }, answer: null } }] }
];
if (params.has('history')) turns = [...Array.from({length:210},(_,i)=>({ ...turns[0], id:uid(100+i), prompt:`Earlier task ${i+1}`, response:`Historical response ${i+1}.\n\n${'A useful detail about the work. '.repeat(12)}`, createdAt: new Date(Date.UTC(2026,8,21,0,i)).toISOString() })), turns[1]];
let skills: any[] = [];
let walletError = params.has('wallet-error');
let modelsError = params.has('models-error');
let offline = params.has('offline'), historyError = false, outcome = '', posted = 0, decisions = 0, quoteData: any, saved: any;
const inspect = () => ({ agents, turns, posted, decisions, quoteData, saved });
Object.assign(window, { fixture: { inspect, resourcesReady: () => { walletError = false; modelsError = false; }, online: () => { offline = false; }, outcome: (value: string) => { outcome = value; }, historyError: (value: boolean) => { historyError = value; },
 changeDecision: () => { turns[1].tools![0].approval!.fingerprint = 'b'.repeat(64); },
 expireDecision: () => { turns[1].tools![0].expiresAt = Date.now()/1000 - 1; },
 account: () => useAccountStore.setState({snapshot:{status:'signedIn',profile:{email:'other@example.test'},secureStorage:true} as any}),
 addReply: () => { turns.push({ ...turns[0], id:crypto.randomUUID(), prompt:'New task from another device', response:'A new reply arrived.', createdAt:new Date().toISOString() }); }
} });
mockIPC(async (command, args: any) => {
 if (command === 'teammate_upload') return {attachment:{id:uid(40),name:args.name,bytes:12}};
 if (command !== 'teammate_request') return null;
 const {path,body} = args;
 if (path === 'vibes/models') { if (modelsError) throw 'Model service unavailable.'; return {models:[{id:'test/reviewer',name:'Reviewer model',available:true,reasoning:{efforts:['low','high']}}]}; }
 if (path === 'vibes/wallet') { if (walletError) throw 'Account service unavailable.'; return {wallet:{consented:true}}; }
 if (path === 'connectors') return {enabled:true,integrations:[]};
 if (path === 'agents/v1/skills') { if (!body) return {skills}; const skill={...body,revision:body.revision+1};skills=[...skills.filter(s=>s.id!==skill.id),skill];return {skill}; }
 if (path === 'agents/v1/teammates' && !body) {
   if (offline) throw 'Connection interrupted. Try again.';
   return {version:1,enabled:!params.has('paused'),teammates:useAccountStore.getState().snapshot.profile?.email === identity ? agents : []};
 }
 if (path.endsWith('/read')) return {ok:true};
 if (path.startsWith('agents/v1/teammates') && body) {
   const existing = agents.find(a=>path.includes(a.id));
   saved = existing ? {...existing,...body,revision:existing.revision+1} : {...agents[0],...body,chatId:uid(50),revision:1};
   agents = [...agents.filter(a=>a.id!==saved.id),saved]; return {teammate:saved};
 }
 if (path.startsWith('vibes/chats/')) {
   if (historyError) throw 'Conversation unavailable. Try again.';
   const all = turns.filter(t=>t.chatId===path.split('/')[2]), cursor = path.split('?before=')[1];
   const end = cursor ? all.findIndex(t=>t.id===cursor) : all.length, page=all.slice(Math.max(0,end-200),end);
   return {turns:structuredClone(page),hasMore:end>200,nextBefore:end>200?page[0].id:null};
 }
 if (path === 'vibes/quote') { quoteData=body; return {quote:'fixture-quote',model:'test/reviewer',estimatedCredits:1,maxCredits:2,expiresAt:Date.now()/1000+120}; }
 if (path === 'vibes/turns') {
   posted++;
   if (outcome === '402') { outcome=''; throw '402: Insufficient Vibes'; }
   let turn = turns.find(t=>t.id===body.id);
   if (!turn) { turn = { id:body.id,chatId:quoteData.chatId,prompt:quoteData.text,model:'test/reviewer',status:'completed',response:'Test reply received. Your message was processed once.',error:null,createdAt:new Date().toISOString() }; turns.push(turn); }
   if (outcome === 'ambiguous') { outcome=''; throw 'Connection interrupted. Refresh to check the outcome.'; }
   return {turn:structuredClone(turn)};
 }
 if (path.startsWith('vibes/turns/')) {
   const turn = turns.find(t=>t.id===path.split('/')[2]); if (!turn) throw '404: Not found';
   if (path.endsWith('/cancel')) {turn.status='cancelled';return {ok:true};}
   return {turn:structuredClone(turn)};
 }
 if (path.startsWith('agents/v1/decisions/')) { decisions++; const tool=turns.flatMap(t=>t.tools??[]).find(t=>path.endsWith(t.id))!;tool.approval!.answer=body.decision;tool.approval!.state=body.decision==='allow'?'queued':'declined';return {ok:true}; }
 throw `Unsupported fixture request: ${path}`;
});
function Fixture() {
 const [active,setActive] = useState(true);
 return <div style={{display:'flex',flexDirection:'column',height:'100%'}}><div style={{height:36,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',fontSize:11,color:'var(--muted)',borderBottom:'1px solid var(--line)'}}><span>Vibyra · isolated Agents test</span><button onClick={()=>setActive(!active)}>{active?'Switch to Code':'Switch to Agents'}</button></div><TeammatesWorkspace active={active}/>{!active&&<p>Code workspace fixture</p>}</div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
