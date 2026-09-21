import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import '../src/styles/adaptive-terminals.css';
import * as redesign from './redesignFixtureData';
import { sharedCliFixture } from './sharedCliFixture';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { ProjectWorkspace } from '../src/components/layout/ProjectWorkspace';
import { SessionList } from '../src/components/rail/SessionList';
import { SavedHistory } from '../src/components/layout/SavedHistory';
import { ProjectSwitcher } from '../src/components/layout/ProjectSwitcher';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { SettingsGeneralPane } from '../src/components/settings/SettingsGeneralPane';
import { useState } from 'react';
import '../src/styles/modals.css';
import '../src/styles/modals.part-02.css';
import '../src/styles/modals.part-03.css';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/chrome.css';
import '../src/styles/workspace.css';
import '../src/styles/workspace.part-02.css';
import '../src/styles/terminal-density.css';
import '@xterm/xterm/css/xterm.css';
import '../src/styles/project-modes.css';
const params = new URLSearchParams(location.search);
if (params.has('light')) document.documentElement.dataset.theme = 'light';
const session = { id:'shared-one',projectId:'project',title:'Build the iPhone experience',status:'running',accountId:'default' };
const snapshot = {settings:{...redesign.settings},workingDirectory:'/Projects/iPhone',turnId:'demo',sessionId:session.id,projectId:'project',generation:'g1',cursor:1,processState:'running',turnState:'idle',hasMore:false,items:[
 {id:'u1',kind:'message',role:'user',text:'Make this feel clear and comfortable on my iPhone.',status:'completed'},
 {id:'a1',kind:'message',role:'assistant',text:'I’ll give the conversation room to breathe, keep your draft safe, and bring questions directly into the chat.',status:'completed'},
 {id:'c1',kind:'activity',title:'Checked the mobile layout',detail:'390 × 844 · portrait\nReadable text, scrolling history and a native composer.',status:'completed'},
] as Record<string,unknown>[]};
if (params.has('redesign')) snapshot.items = redesign.items;
if (params.has('resume')) {
 session.status = 'interrupted'; snapshot.processState = 'interrupted';
 useConversationTerminals.setState({open:[session.id],dismissed:[]});
}
let resumes = 0;
let submissions = 0;
const receipts = new Map();
const cli = sharedCliFixture();
mockIPC(async (command, args) => {
 const a = args as Record<string,any>;
 if (command.startsWith('shared_cli_')) return cli(command, a);
 if (command === 'save_settings') { localStorage.setItem('fixture.settings', JSON.stringify(a.settings)); return null; }
 if (command === 'get_settings') return JSON.parse(localStorage.getItem('fixture.settings') ?? '{}');
 if (command === 'shared_chat_list') return [{...session}];
 if (command === 'provider_accounts') return [{id:'codex',installed:true,accounts:[{accountId:'default',status:'connected',accountLabel:'Personal ChatGPT'}]}];
 if (command === 'shared_chat_create') return session;
 if (command !== 'shared_chat_request') return null;
 if (a.method === 'conversation.resume') {
  resumes++; document.body.dataset.resumes = String(resumes); document.body.dataset.resumedId = a.params.sessionId;
  if (resumes === 1) throw new Error('Fixture: saved thread temporarily unavailable');
  session.status = 'running'; snapshot.processState = 'running'; snapshot.generation = 'g2'; snapshot.cursor++;
  return session;
 }
 if (a.method === 'conversation.commands') return { version:1, commands:redesign.commands, unsupported:[] };
 if (a.method === 'conversation.status') return { provider:'codex',workingDirectory:snapshot.workingDirectory,settings:snapshot.settings,turnState:snapshot.turnState,savedRules:[],controlOwner:'desktop' };
 if (a.method === 'conversation.usage') return redesign.usage;
 if (a.method === 'conversation.models') return { models:[{model:'gpt-6-astra',displayName:'GPT-6 Astra',defaultReasoningEffort:'high',supportedReasoningEfforts:['low','medium','high','xhigh'].map(reasoningEffort=>({reasoningEffort,description:`${reasoningEffort} reasoning`}))}] };
 if (a.method === 'conversation.settings') { snapshot.settings={...snapshot.settings,model:a.params.model,effort:a.params.effort,revision:snapshot.settings.revision+1};snapshot.cursor++;return snapshot.settings; }
 if (a.method === 'conversation.artifact') return {id:'patch',hash:'fixture',content:redesign.patch,offset:0,nextOffset:null,bytes:redesign.patch.length};
 if (a.method === 'conversation.events') return {cursor:snapshot.cursor,generation:snapshot.generation};
 if (a.method === 'conversation.snapshot') return snapshot;
 if (a.method === 'turn.submissionStatus') return receipts.get(a.params.submissionId) ?? {status:'notFound'};
 if (a.method === 'turn.submit') {
  submissions++; document.body.dataset.submissions = String(submissions);
  if (params.has('delayed-send')) await new Promise<void>(resolve => window.addEventListener('fixture-finish-send', () => resolve(), { once: true }));
  receipts.set(a.params.submissionId,{status:'accepted'});
  snapshot.items.push({id:a.params.submissionId,kind:'message',role:'user',text:a.params.text,status:'completed'}); snapshot.cursor++;
  if (params.has('lost') && submissions === 1) throw new Error('The reply was lost. Check delivery before retrying.');
  return {status:'accepted'};
 }
 if (a.method === 'session.stop') {snapshot.processState='exited';snapshot.cursor++;session.status='exited';return {ok:true};}
 return {status:'accepted'};
});
useProjectStore.setState({activeId:'project',view:'project'});
useSettingsStore.setState({settings:{projects:[{id:'project',name:'iPhone experience',root:'/Projects/iPhone'}],fontSize:13,fontFamily:'monospace',scrollbackLines:1000,screenshotShortcut:'F9',theme:params.has('light')?'light':'dark',agentView:params.has('redesign')?'chat':undefined,...JSON.parse(localStorage.getItem('fixture.settings') ?? '{}')} as any});
useWorkspaceStore.setState({companionOpen:false});
useTerminalStore.setState({panes:[{id:-9,projectId:'project',agentId:'shell',title:'Existing shell',status:'suspended',visibility:'visible',snapshot:'Existing terminal output remains intact.',accent:'#888',model:null} as any]});
function FixtureSettings() {
 const [open,setOpen]=useState(false);
 const {settings,update}=useSettingsStore();
 return <><button className="btn" onClick={()=>setOpen(true)}>Settings</button>{open && <div className="modal-backdrop"><section className="modal" role="dialog" aria-label="General settings" style={{maxHeight:'90vh',overflow:'auto',padding:24}}><button className="btn" onClick={()=>setOpen(false)}>Close settings</button><SettingsGeneralPane settings={settings!} update={update}/></section></div>}</>;
}
function FixtureHistory() { return useWorkspaceStore(s => s.historyOpen) ? <SavedHistory /> : null; }
createRoot(document.getElementById('root')!).render(<div style={{height:"100vh",display:"flex"}}><aside style={{width:190,padding:12}}><>{params.has('redesign') && <p style={{color:'var(--muted)',fontSize:10}}>CONVERSATION DESIGN FIXTURE</p>}<FixtureSettings/><ProjectSwitcher/><SessionList query="" /></></aside><ProjectWorkspace /><FixtureHistory /></div>);
