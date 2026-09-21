import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { TitleBar } from '../src/components/layout/TitleBar';
import { Companion } from '../src/components/companion/Companion';
import { VoiceHud } from '../src/components/layout/VoiceHud';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useProjectStore } from '../src/state/projectStore';
import { useChatStore } from '../src/state/chatStore';
import { useNotificationStore } from '../src/state/notificationStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/base.part-02.css';
import '../src/styles/controls.css';
import '../src/styles/chrome.css';
import '../src/styles/chrome.part-02.css';
import '../src/styles/chrome-account.css';
import '../src/styles/project-focus.css';
import '../src/styles/project-tools.css';
import '../src/styles/companion.css';
import '../src/styles/companion.part-02.css';
import '../src/styles/companion.part-03.css';
import '../src/styles/companion-shell.css';
import '../src/styles/companion-chat.css';
import '../src/styles/companion-chat-composer.css';
import '../src/styles/companion-files.css';
import '../src/styles/rail.css';
import '../src/styles/rail.part-02.css';
import '../src/styles/rail.part-03.css';
import '../src/styles/notifications-bell.css';
import '../src/styles/notifications-center.css';
import '../src/styles/notifications-center.part-02.css';
import '../src/styles/workspace.part-03.css';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') ?? 'dark';
mockWindows('main');
let speech: string | null = null;
const files = [{path:'src/App.tsx',status:' M',previousPath:null},{path:'src/new panel.tsx',status:'??',previousPath:null},{path:'src/old.tsx',status:' D',previousPath:null}];
const calls: { command: string; args: unknown }[] = [];
Object.assign(window, { fixtureCalls: calls });
Object.assign(window, { fixtureSpeech: () => speech });
window.addEventListener('fixture-notifications', ((event: CustomEvent<number>) => {
 const history = Array.from({length:event.detail}, (_, index) => ({id:index + 1,category:'system' as const,severity:'info' as const,title:`Workspace update ${index + 1}`,at:Date.now(),count:1,read:false}));
 useNotificationStore.setState({history,unread:history.length});
}) as EventListener);
window.addEventListener('fixture-worktree', () => useConversationTerminals.setState({ focused:'safe', sessions:[{id:'safe',projectId:'studio',title:'Safe task',accountId:'default',status:'running'}] }));
window.addEventListener('fixture-file-change', () => { files.push({path:`src/live${files.length}.ts`,status:' M',previousPath:null}); useWorkspaceStore.setState(s=>({fsVersion:s.fsVersion+1})); });
mockIPC(async (command, raw) => {
 const args = raw as Record<string, any>; calls.push({command,args});
 if (command === 'shared_chat_request' && args.method === 'conversation.status') return {workingDirectory:'/Projects/Studio-worktree'};
 if (command === 'fs_changes') return {root:'/Projects/Studio',files:[...files]};
 if (command === 'fs_change_preview') return `Working changes\n--- a/${args.path}\n+++ b/${args.path}\n@@ -1 +1 @@\n-old content\n+Live update ${files.length}`;
 if (command === 'fs_list_dir') return args.path.endsWith('/src')
  ? [{name:files.length > 4 ? 'live-created.ts' : 'App.tsx',path:`${args.path}/${files.length > 4 ? 'live-created.ts' : 'App.tsx'}`,isDir:false,size:24,modifiedMs:null}]
  : [{name:'README.md',path:`${args.path}/README.md`,isDir:false,size:24,modifiedMs:null},{name:'src',path:`${args.path}/src`,isDir:true,size:0,modifiedMs:null}];
 if (command === 'voice_status') return {recorder:true,keyConfigured:true};
 if (command === 'voice_start') return null;
 if (command === 'voice_stop') return args.discard ? null : 'Please review these changes.';
 if (command === 'speech_start') {
  if (query.has('slow-speech')) await new Promise(resolve=>setTimeout(resolve,200));
  speech=args.id; return null;
 }
 if (command === 'speech_stop') { if (speech === args.id) speech=null; return null; }
 if (command === 'speech_active') return speech===args.id;
 if (command === 'load_memory') return '';
 if (command === 'search_memory_sources') return [];
 if (command === 'ai_chat') return 'The changes are ready for review. The workspace keeps your current work intact.';
 return null;
});
useSettingsStore.setState({settings:{projects:[{id:'studio',name:'Studio',root:'/Projects/Studio'}],fontSize:13,fontFamily:'monospace',theme:query.get('theme')??'dark',openaiKeyConfigured:true,voiceShortcut:'F8',screenshotShortcut:'F9'} as any});
useProjectStore.setState({activeId:'studio',view:'project'});
useWorkspaceStore.setState({root:'/Projects/Studio',companionOpen:true,companionTab:'chat',companionSize:'compact'});
useChatStore.setState({threads:{studio:[{role:'user',content:'What changed in the workspace?'},{role:'assistant',content:'The chat layout is clearer, and file changes update as you work. You can review each file before continuing.'}]}});
createRoot(document.getElementById('root')!).render(<div style={{height:'100vh',display:'flex',flexDirection:'column'}}><TitleBar/><main className="project-workspace" style={{position:'relative',flex:1}}><div style={{padding:40,color:'var(--dim)'}}>Studio workspace</div><Companion/></main><VoiceHud/></div>);
