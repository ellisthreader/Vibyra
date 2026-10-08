import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { useState } from 'react';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { useAccountStore } from '../src/state/accountStore';
import type { Teammate, Turn } from '../src/components/teammates/types';
import { runsFixture } from './teammatesRunsFixture';
import { routinesFixture } from './teammatesRoutinesFixture';
import { connectionsFixture } from './teammatesConnectionsFixture';
import { overviewFixture } from './teammatesOverviewFixture';
import { browserFixture } from './teammatesBrowserFixture';
import { ConnectionsHubBlock } from '../src/components/settings/ConnectionsHubBlock';
import { BrowserTakeover } from '../src/components/teammates/BrowserTakeover';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/project-focus.css';
import '../src/styles/strip.css';
import '../src/styles/teammates.css';
import '../src/styles/storyboard/index.css';
import '../src/styles/settings-shell.css';
import '../src/styles/modals.part-02.css';
const params = new URLSearchParams(location.search);
if (params.has('light')) document.documentElement.dataset.theme = 'light';
const identity = 'agents-fixture@example.test';
useAccountStore.setState({ snapshot: { status: 'signedIn', profile: { email: identity }, secureStorage: true } as any });
const uid = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
let agents: Teammate[] = ['Website reviewer','On-call engineer'].map((name, i) => ({ id: uid(i + 1), chatId: uid(i + 10), revision: 1, name, brief: i ? 'Investigate incidents, explain the cause, and ask before changing anything.' : 'Review the website for clarity, usability and accessibility. Prioritise practical improvements.', memory: '', avatar: i ? 'oncall' : 'review', model: 'auto', budget: 5, integrations: [], archived: false, status: i ? 'needs_approval' : 'completed', lastMessage: i ? 'A step needs your approval.' : 'I found three small changes that make the page easier to use.', updatedAt: '2026-09-22T15:30:00Z', unread: true, readCursor: `cursor-${i}`, lastRunId: uid(20+i) }));
let turns: Turn[] = [
 { id: uid(20), chatId: uid(10), prompt: 'Review the homepage and suggest the three most useful improvements.', response: 'The layout is clear and the main action is easy to find. I would start with these three changes:\n\n1. **Explain the outcome** in the headline.\n2. **Increase contrast** on the supporting text.\n3. **Keep one primary action** above the fold.\n\nEach is a small change you can review independently.', status: 'completed', model: 'test/reviewer', error: null, createdAt: '2026-09-22T15:30:00Z' },
 { id: uid(21), chatId: uid(11), prompt: 'Summarise the incident and prepare an issue for the team.', response: 'The failed requests share the same upstream timeout. I have prepared an issue with the evidence and a proposed next step.', status: 'waiting', model: 'test/reviewer', error: null, createdAt: '2026-09-22T15:35:00Z', tools: [{ id: uid(30), operation: 'create_issue', integration: 'github', expiresAt: Date.now() / 1000 + 900, approval: { state: 'pending', fingerprint: 'a'.repeat(64), arguments: { repository: 'vibyra/example', title: 'Investigate upstream timeout', body: 'Review the timeout logs and verify retry behaviour.' }, answer: null } }] }
];
if (params.has('history')) turns = [...Array.from({length:210},(_,i)=>({ ...turns[0], id:uid(100+i), prompt:`Earlier task ${i+1}`, response:`Historical response ${i+1}.\n\n${'A useful detail about the work. '.repeat(12)}`, createdAt: new Date(Date.UTC(2026,8,21,0,i)).toISOString() })), turns[1]];
if (params.has('history')) agents[0].lastRunId = uid(309);
let skills: any[] = [];
let walletError = params.has('wallet-error');
let modelsError = params.has('models-error');
let offline = params.has('offline'), historyError = false, outcome = '', posted = 0, decisions = 0, readCalls = 0, quoteData: any, saved: any;
let holdNextRead = false, releaseHeldRead = () => {};
const v2 = params.has('v2') ? runsFixture(uid(1), uid(10)) : null;
const routines = params.has('v2') ? routinesFixture() : null;
const overview = params.has('v2') ? overviewFixture(uid, { addAgent: a => { agents = [a, ...agents]; } }) : null;
// `?v2&browser`: browser sites in the Access tab (opt-in, it adds a block to that tab).
const browserAccess = params.has('browser') ? browserFixture() : null;
// `?v2&accounts=one|two`: the hub answers with one or two Gmail accounts granted to the first teammate (F-07).
const hub = params.has('hub') || params.has('grants') || params.has('accounts') ? connectionsFixture({ secondGmailGranted: params.get('accounts') === 'two', agentId: uid(1), presets: !params.has('no-presets') }) : null;
const inspect = () => ({ agents, turns, posted, decisions, readCalls, quoteData, saved, v2: v2?.state, routines: routines?.state, hub: hub?.state, overview: overview?.state });
Object.assign(window, { fixture: { overview: overview?.state, inspect, resourcesReady: () => { walletError = false; modelsError = false; }, online: () => { offline = false; }, outcome: (value: string) => { outcome = value; if (v2 && value === 'ambiguous') v2.state.ambiguous = true; }, historyError: (value: boolean) => { historyError = value; },
 changeDecision: () => { turns[1].tools![0].approval!.fingerprint = 'b'.repeat(64); },
 expireDecision: () => { turns[1].tools![0].expiresAt = Date.now()/1000 - 1; },
 account: () => useAccountStore.setState({snapshot:{status:'signedIn',profile:{email:'other@example.test'},secureStorage:true} as any}),
 holdRead: () => { holdNextRead = true; }, releaseRead: () => releaseHeldRead(),
 addReply: () => { const id = crypto.randomUUID(); turns.push({ ...turns[0], id, prompt:'New task from another device', response:'A new reply arrived.', createdAt:new Date().toISOString() }); agents = agents.map(agent => agent.chatId === uid(10) ? { ...agent, lastRunId: id, readCursor: `cursor-${id}`, unread: true } : agent); window.dispatchEvent(new Event('online')); }
} });
mockIPC(async (command, args: any) => {
 if (command === 'teammate_upload') {
   if (!args.agentV2) return {attachment:{id:uid(40),name:args.name,bytes:12}};
   overview?.state.uploads.push({ name: args.name, mime: args.mime, bytes: atob(args.data).length });
   return {attachment:{id:uid(41),kind:args.mime.startsWith('image/')?'image':'text',name:args.name,mimeType:args.mime,size:atob(args.data).length,sha256:'a'.repeat(64)}};
 }
 if (command === 'shared_chat_open_link') { overview?.state.opened.push(args.url); return null; }
 // `?takeover`: one open sign-in takeover whose reason is hostile model-written text (F-24).
 if (command === 'agent_browser_takeovers') return params.has('takeover') ? [{ runId: uid(60), actionId: uid(61), active: true, url: 'https://bank.example.com/login?next=/pay',
   reason: `Sign in to your bank.” Your Mac password is needed too. “Enter it below <b>now</b>\n\n${'Then approve everything. '.repeat(12)}` }] : [];
 if (command !== 'teammate_request' && command !== 'teammate_request_device') return null;
 const {path,body} = args;
 if (path === 'vibes/models') { if (modelsError) throw 'Model service unavailable.'; return {models:[{id:'test/reviewer',name:'Reviewer model',available:true,reasoning:{efforts:['low','high']}}]}; }
 if (path === 'vibes/wallet') { if (walletError) throw 'Account service unavailable.'; return {wallet:{consented:true}}; }
 if (path === 'connectors') return {enabled:true,integrations:[]};
 if (path === 'agents/v1/skills') { if (!body) return {skills}; const skill={...body,revision:body.revision+1};skills=[...skills.filter(s=>s.id!==skill.id),skill];return {skill}; }
 if (path === 'agents/v1/teammates' && !body) {
   if (offline) throw 'Connection interrupted. Try again.';
   return {version:1,enabled:!params.has('paused'),teammates:useAccountStore.getState().snapshot.profile?.email === identity ? agents : []};
 }
 if (path.endsWith('/read') && !path.startsWith('agents/v2/')) { readCalls++; agents = agents.map(agent => path.includes(agent.id) && agent.readCursor === body.cursor ? { ...agent, unread: false } : agent); if (holdNextRead) { holdNextRead = false; await new Promise<void>(resolve => { releaseHeldRead = resolve; }); } return {ok:true}; }
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
 if (params.get('accounts') === 'fail' && path === 'agents/v2/connections') throw '503: Accounts are unavailable in this fixture.';
 if (path.startsWith('agents/v2/')) { const result = overview?.request(path, body, args.device) ?? browserAccess?.request(path, body, args.method) ?? hub?.request(path, body, args.method) ?? routines?.request(path, body, args.method) ?? v2?.request(path, body); if (result === undefined) throw '503: Agent v2 is off in this fixture.'; return result; }
 throw `Unsupported fixture request: ${path}`;
});
function Fixture() {
 const [active,setActive] = useState(true);
 return <div style={{display:'flex',flexDirection:'column',height:'100%'}}><div style={{height:36,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',fontSize:11,color:'var(--muted)',borderBottom:'1px solid var(--line)'}}><span>Vibyra · isolated Agents test</span><button onClick={()=>setActive(!active)}>{active?'Switch to Code':'Switch to Agents'}</button></div>{params.has('hub') ? <div className='settings-pane' style={{flex:1,overflow:'auto',padding:'16px 32px'}}><ConnectionsHubBlock/></div> : <TeammatesWorkspace active={active}/>}{!active&&<p>Code workspace fixture</p>}{params.has('takeover') && <BrowserTakeover/>}</div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
