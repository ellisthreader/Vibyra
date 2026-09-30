import { usePhoneStore } from '../src/state/phoneStore';
import { HomeView } from '../src/components/home/HomeView';
import '@xterm/xterm/css/xterm.css';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { ProjectWorkspace } from '../src/components/layout/ProjectWorkspace';
import { TitleBar } from '../src/components/layout/TitleBar';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { useProductMode } from '../src/state/productModeStore';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useReportStore } from '../src/state/reportStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/chrome.css';
import '../src/styles/chrome.part-02.css';
import '../src/styles/workspace-font.css';
import '../src/styles/strip.css';
import '../src/styles/workspace.css';
import '../src/styles/workspace.part-02.css';
import '../src/styles/terminal-suspended.css';
import '../src/styles/project-modes.css';
import '../src/styles/adaptive-terminals.css';
import '../src/styles/project-focus.css';
import '../src/styles/teammates.css';
const query = new URLSearchParams(location.search);
Object.assign(window, { setPhoneFixture: (active: string[]) => usePhoneStore.setState({status: {enabled:true, discoverable:true, address:'', error:null, devices:[], pending:[], active}}), remoteSection: () => useWorkspaceStore.getState().settingsSection, closeSettings: () => useWorkspaceStore.getState().closeSettings(), agentPicker: () => useWorkspaceStore.getState().agentPickerOpen, projectView: () => useProjectStore.getState().view, workspaceRoot: () => useWorkspaceStore.getState().root, reportEntryState: () => ({open:useReportStore.getState().open,area:useReportStore.getState().draft?.area,view:useReportStore.getState().surroundings?.context.view,project:useReportStore.getState().surroundings?.context.project}), resetReportEntry: () => useReportStore.setState({open:false,draft:null,surroundings:null}) });
(window as any).setPhoneFixture([]);
if (query.has('light')) document.documentElement.dataset.theme='light';
useAccountStore.setState({snapshot:{status:'signedIn',profile:{name:'Fixture',email:'fixture@example.test',plan:'free'},secureStorage:true,error:null,pendingProvider:null} as any});
useProjectStore.setState({activeId:query.has('empty')?null:'project',view:query.has('empty')?'home':'project'});
useSettingsStore.setState({settings:{projects:query.has('empty')?[]:[{id:'project',name:'Vibyra',root:'/fixture/vibyra'}],fontSize:12,scrollbackLines:1000,fontFamily:'monospace',theme:query.has('light')?'light':'dark'} as any});
useWorkspaceStore.setState({companionOpen:false});
useConversationTerminals.setState({loaded:true,sessions:[],open:[]});
const names=['Simplify the navigation','Improve sign-in','Build the project API','Test the new navigation','Update the documentation','Development server'];
const count = query.has('empty') ? 0 : Number(query.get('count') ?? 6);
const visibleNames = Array.from({length:count},(_,i) => i === count - 1 ? 'Development server' : names[i % 5]);
useTerminalStore.setState({focusedId:1,panes:visibleNames.map((title,i)=>({id:i+1,projectId:'project',agentId:i===count-1?'shell':'codex',title,status:'suspended',visibility:'visible',snapshot:i===count-1?'$ npm run dev\r\nDevelopment server ready\r\nLocal: http://localhost:5173':'› '+title+'\r\n\r\nRead project instructions\r\nInspect project files\r\nApply the changes\r\n\r\nThe update is ready. Checks passed.\r\n\r\n'+('Existing saved terminal output.\r\n'.repeat(12)),accent:'#888',model:null})) as any});
if (query.has('tree')) {
  const settings = useSettingsStore.getState().settings!;
  useSettingsStore.setState({ settings: { ...settings, projects: [...settings.projects,
    { id: 'api', name: 'vibyra-api', root: '/fixture/api', color: '#888', lastOpenedMs: 0 },
    { id: 'website', name: 'vibyra-website', root: '/fixture/website', color: '#888', lastOpenedMs: 0 }] } });
  useTerminalStore.setState(state => ({ panes: [...state.panes, { ...state.panes[0], id: 99, title: 'zsh', projectId: 'api' }] }));
}
const agents=[{id:'agent-one',chatId:'chat-one',revision:1,name:'On-call engineer',brief:'Look after production',memory:'',avatar:'oncall',budget:10,integrations:[],archived:false,status:'completed',lastMessage:'The fix is ready for review.',updatedAt:'2026-09-21T09:41:00Z'}];
const requests: any[] = []; let interrupted = false; Object.assign(window,{redesignRequests:requests});
mockIPC(async(command,args:any)=>{
 if(command==='save_settings' || command==='shared_chat_remove_project') { requests.push({path:command,body:args}); return null; }
 if(command==='voice_status') return {recorder:true,keyConfigured:true};
 if(command==='voice_start') { requests.push({path:command}); return null; }
 if(command==='voice_stop') { requests.push({path:command,body:args}); return args.discard ? null : 'Dictated draft.'; }
 if(command==='terminal_write') { requests.push({path:command,body:args}); return null; }
 if(command==='shared_chat_list') return [];
 if(command==='teammate_request') {
  if(args.path==='vibes/quote') { requests.push({path:args.path,body:args.body}); return {quote:'fixture-estimate',model:'auto',estimatedCredits:1,maxCredits:3,expiresAt:Date.now()/1000+120}; }
  if(args.path==='vibes/turns') { requests.push({path:args.path,body:args.body}); if(query.has('send-timeout') && !interrupted) {interrupted=true; throw 'Connection interrupted';} return {turn:{id:args.body.id}}; }
  if(args.path==='agents/v1/teammates') return {version:1,enabled:true,teammates:agents};
  if(args.path==='vibes/models') return {models:[]};
  if(args.path==='vibes/wallet') return {wallet:{consented:true}};
  if(args.path==='vibes/chats/chat-one/turns') return {turns:[{id:'turn-one',chatId:'chat-one',model:'Auto',status:'completed',prompt:'What’s causing the checkout issue?',response:'A deleted product has no price, so the cart total is NaN. The fix is ready for review.',createdAt:'2026-09-21T09:41:00Z'}]};
  if(args.path==='agents/v1/skills') return {skills:[]};
  throw new Error('Unsupported fixture request: '+args.path);
 }
 return null;
});
function Fixture(){const mode=useProductMode(s=>s.mode);const railOpen=useWorkspaceStore(s=>s.projectsSidebarOpen);const view=useProjectStore(s=>s.view);return <div className={`app ${mode==='work'&&!railOpen?'app--projects-hidden':''}`} style={{height:'100vh'}}><TitleBar/><div className="shell"><div className="product-code-shell" hidden={mode!=='work'}><ProjectStrip/>{view==='project'?<ProjectWorkspace/>:<HomeView/>}</div><TeammatesWorkspace active={mode==='agent'}/></div></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
