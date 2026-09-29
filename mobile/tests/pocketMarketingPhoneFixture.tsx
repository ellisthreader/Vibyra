/** Production phone chrome with sanitized project and local sample output. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppHeader } from '../src/ui/AppHeader';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import { SessionScreen } from '../src/ui/SessionScreen';
import { WorkScreen } from '../src/ui/WorkScreen';
import { PreviewWebView } from '../src/preview/PreviewWebView';
import { palettes, ThemeContext } from '../src/theme';
import type { WorkspaceModel, Session, Project } from '../src/ui/types';

const scene = new URLSearchParams(location.search).get('scene') || 'projects';
const project = {id:'orbit',name:'Orbit',path:'/Projects/Orbit',branch:'main'};
const session: Session = {id:'orbit-shell',projectId:'orbit',title:'Terminal',kind:'shell',canInput:true,status:'running',createdAt:'2026-09-27T09:41:00Z'};
const sharedProjects: Project[] = [project,
  {id:'weekend',name:'Weekend project',path:'/Projects/Weekend',branch:'main'},
  {id:'studio',name:'Studio website',path:'/Projects/Studio',branch:'main'}];
const sharedSessions: Session[] = sharedProjects.map((item) => ({...session,id:`${item.id}-shell`,projectId:item.id,title:`${item.name} · Terminal`}));
const noop = async () => {};
function Fixture() {
  const [output, setOutput] = useState('$ npm test\r\n');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const choose = (id:string) => {
    const next = sharedProjects.find(item => item.id === id);
    if (!next) return;
    setSelectedId(id); setDrawerOpen(false);
    setOutput('$ git status --short\r\n\r\nWorking tree clean\r\n$');
  };
  Object.assign(window, { pocketChooseProject: choose, pocketShowProjects: () => setDrawerOpen(true), pocketTerminal: (step:number) => {
    const lines = ['$ npm test', '', ' RUN  v3.2.0 /Projects/Orbit', '',
      ' ✓ src/orbit.test.tsx (8 tests)', ' ✓ src/workspace.test.ts (4 tests)', '',
      ' Test Files  2 passed (2)', ' Tests       12 passed (12)', '', '$'];
    setOutput(lines.slice(0, Math.max(1, step)).join('\r\n'));
  } });
  const selectedProject = sharedProjects.find(item => item.id === selectedId);
  const selectedSession = sharedSessions.find(item => item.projectId === selectedId);
  const projects = scene === 'projects' ? sharedProjects : [project];
  const sessions = scene === 'projects' ? sharedSessions : [session];
  const workspace: WorkspaceModel = {
    status:'connected', control:'ready', error:null,
    host:{id:'sample-mac',name:'Alex’s Mac',platform:'macos'}, hostAddress:'relay.vibyra.test',throughCloud:true,
    projects, sessions, devices:[], approvals:[], selectedSessionId:scene === 'projects' ? selectedSession?.id ?? null : session.id,
    output, themePreference:'dark', onboarding:{status:'complete',mode:'computer'}, account:null,
    actions:{connect:noop,disconnect:noop,refresh:noop,selectSession:()=>{},createSession:async()=>selectedSession ?? session,
      sendInput:noop,resize:noop,stopSession:noop,listFiles:async()=>({entries:[]}),
      readFile:async(_project,path)=>({path,content:'',truncated:false}),getDiff:async()=>({diff:'',truncated:false}),setTheme:()=>{}},
  } as WorkspaceModel;
  return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:780},insets:{top:0,bottom:0,left:0,right:0}}}>
    <ThemeContext.Provider value={{colors:palettes.dark,dark:true}}>
      <View style={{flex:1,backgroundColor:palettes.dark.background}}>
        {scene !== 'preview' && <AppHeader destination="work" workspace={workspace} session={scene === 'terminal' ? session : selectedSession}
          project={undefined} connected compact={false} onMenu={() => setDrawerOpen(true)} onNewChat={()=>{}}
          onSwitchChat={()=>{}} onComputers={()=>{}} onSessionOptions={()=>{}} />}
        {scene === 'projects' && (selectedSession
          ? <SessionScreen key={selectedSession.id} session={selectedSession} workspace={workspace} />
          : <WorkScreen workspace={workspace} connected onProjects={()=>{}} onNewProject={()=>{}} onConnect={()=>{}} />)}
        {scene === 'projects' && <NavigationDrawer visible={drawerOpen} destination="work" workspace={workspace} project={selectedProject}
          currentProjectId={selectedId} onClose={() => setDrawerOpen(false)} onNavigate={()=>{}} onNew={()=>{}} onSettings={()=>{}}
          onEnterProject={choose} />}
        {scene === 'terminal' && <SessionScreen session={session} workspace={workspace} />}
        {scene === 'preview' && <PreviewWebView startUrl={`${location.origin}/orbit.html`} label="localhost:3000" onClose={()=>{}} />}
      </View>
    </ThemeContext.Provider>
  </SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
