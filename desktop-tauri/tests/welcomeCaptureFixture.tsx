/** Production components with sample content, used only to capture intro images. */
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { TitleBar } from '../src/components/layout/TitleBar';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { ProjectWorkspace } from '../src/components/layout/ProjectWorkspace';
import { HomeView } from '../src/components/home/HomeView';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useProductMode } from '../src/state/productModeStore';
import { usePhoneStore } from '../src/state/phoneStore';
import { getTerminal } from '../src/lib/terminalRegistry';
import { welcomeTerminals } from './welcomeTerminalData';
import '@xterm/xterm/css/xterm.css';
const query = new URLSearchParams(location.search);
const scene = query.get('scene') || 'home';
const theme = query.get('theme') || 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.platform = 'mac';
mockWindows('main');
const agents = [
  { id:'research', chatId:'research-chat', name:'Research assistant', brief:'Turn research into a useful brief', avatar:'review', lastMessage:'Your research brief is ready.' },
  { id:'engineer', chatId:'engineer-chat', name:'Code reviewer', brief:'Review changes before they ship', avatar:'qa', lastMessage:'I’ve reviewed the latest changes.' },
  { id:'writer', chatId:'writer-chat', name:'Content writer', brief:'Clear copy for your next launch', avatar:'assistant', lastMessage:'The first draft is ready for you.' },
].map(a => ({...a, revision:1, memory:'', budget:10, integrations:[], archived:false, status:'completed', updatedAt:'2026-09-22T09:41:00Z'}));
const phone = { enabled:true, typing:false, discoverable:true, listening:true, address:'192.168.1.10:4319', error:null, devices:[{id:'sample-phone',name:'Studio iPhone',lastRoute:'cloud' as const,lastFrom:'Vibyra Cloud'}], active:['sample-phone'], pending:[], remote:{enabled:true,signedIn:true,leg:{state:'online' as const,clients:1}} };
mockIPC(async(command, args:any) => {
  if (command === 'phone_status') return phone;
  if (command === 'software_compositing') return true;
  if (command === 'shared_chat_list') return [];
  if (command === 'teammate_request') {
    if (args.path === 'agents/v1/teammates') return {version:1,enabled:true,teammates:agents};
    if (args.path.includes('/turns')) return {turns:[{id:'intro-turn',chatId:'research-chat',model:'Auto',status:'completed',prompt:'Summarise the research for our new studio website.',response:'Here are three clear priorities for the new website:\n\n1. Lead with selected work, so visitors can see your strengths.\n2. Give each project a short story: the brief, the approach and the result.\n3. Make contacting the studio a simple next step.\n\nI can turn this into a page-by-page content brief next.',createdAt:'2026-09-22T09:41:00Z'}]};
    if (args.path === 'vibes/models') return {models:[]};
    if (args.path === 'vibes/wallet') return {wallet:{consented:true}};
    return {skills:[]};
  }
  return null;
});
useAccountStore.setState({snapshot:{status:'signedIn',profile:{name:'Alex',email:'alex@example.test',plan:'free'},secureStorage:true,error:null,pendingProvider:null} as any});
useSettingsStore.setState({settings:{projects:[{id:'studio',name:'Studio website',root:'/Projects/Studio',color:'#5b7cfa',lastOpenedMs:0}],theme,fontSize:13,fontFamily:'monospace',scrollbackLines:1000,agentView:'terminal'} as any});
useProjectStore.setState({activeId:'studio',view:scene === 'code' ? 'project' : 'home'});
useWorkspaceStore.setState({companionOpen:false,settingsOpen:scene === 'phone',settingsSection:'iphone'});
usePhoneStore.setState({status:phone});
useTerminalStore.setState({focusedId:1,panes:scene === 'code' ? welcomeTerminals.map((item,index) => ({id:index+1,projectId:'studio',agentId:item.agentId,title:item.title,status:'running',visibility:'visible',accent:'#5b7cfa',model:null})) as any : []});
Object.assign(window, { seedWelcomeTerminals: async () => {
  for (let i = 0; i < welcomeTerminals.length; i++) {
    const entry = getTerminal(i + 1);
    if (!entry) throw new Error('Terminal is not mounted');
    await new Promise<void>(done => entry.term.write('\x1b[2J\x1b[H' + welcomeTerminals[i].lines.join('\r\n'), done));
  }
} });
useConversationTerminals.setState({loaded:true,sessions:[],open:[],dismissed:[]});
useProductMode.setState({mode:scene === 'agents' ? 'agent' : 'work'});
createRoot(document.getElementById('root')!).render(<div className="app">
  <TitleBar />
  <div className="shell">{scene === 'agents' ? <TeammatesWorkspace active /> : <div className="product-code-shell"><ProjectStrip />{scene === 'code' ? <ProjectWorkspace /> : <HomeView />}</div>}</div>
  {scene === 'phone' && <SettingsModal />}
</div>);
