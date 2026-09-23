import { Toasts } from '../src/components/notifications/Toasts';
import '../src/styles/notifications-toast.css';
import '../src/styles/notifications-toast.part-02.css';
import { useEffect } from 'react';
import { useConnectors } from '../src/components/settings/useConnectors';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { TitleBar } from '../src/components/layout/TitleBar';
import { Companion } from '../src/components/companion/Companion';
import { useLaunchSettingsStore } from '../src/state/launchSettingsStore';
import { useAccountStore } from '../src/state/accountStore';
import { VoiceHud } from '../src/components/layout/VoiceHud';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useProjectStore } from '../src/state/projectStore';
import { useChatStore } from '../src/state/chatStore';
import { useNotificationStore } from '../src/state/notificationStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import './workspaceToolsStyles';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') ?? 'dark';
mockWindows('main');
let speech: string | null = null;
// The spoken conversation polls the live level to decide when a turn is over.
// Here one turn is a short burst of speech and then quiet, so a conversation
// runs at test speed without a microphone.
let listeningSince = 0;
let speechSince = 0;
// Opt-in: a spoken reply that finishes by itself, the way `say` exiting ends
// real playback. Off by default so the explicit read/stop checks still own the
// case where a reply is left playing.
const SPOKE_REPLY_MS = 2500;
const SPOKE_MS = 600;
let githubConnected = query.has('connector-sync') && !query.has('disconnected');
let delayCatalogue = false;
window.addEventListener('fixture-slow-catalogue',()=>{delayCatalogue=true;});
window.addEventListener('fixture-github-disconnect',()=>{githubConnected=false;});
const previewPhases: Record<string,string> = {};
const catalogue = () => ({enabled:true,integrations:[{id:'github',account:'ellis',installed:githubConnected,credential:{configured:true},reads:'Read your selected repositories.',writes:'Create issues when explicitly requested.'}]});
window.addEventListener('fixture-safe', ((e: CustomEvent<boolean>) => useLaunchSettingsStore.getState().update('studio',{safeMode:e.detail})) as EventListener);
Object.assign(window,{fixtureWorkspace:useWorkspaceStore});
const files = [{path:'src/App.tsx',status:' M',previousPath:null},{path:'src/new panel.tsx',status:'??',previousPath:null},{path:'src/old.tsx',status:' D',previousPath:null}];
// One reply carrying every shape the renderer has to handle, so a screenshot
// of it is a screenshot of the markdown surface. Stop and the error case cut
// into the same text, which is what makes a short reply obviously short.
const CHAT_REPLY = `Here is what the workspace looks like right now, read in the order I would read it myself.
Nothing below has been changed for you; this is only a summary of what is already sitting on disk.

| File | Change |
| --- | --- |
| src/App.tsx | Modified |
| src/old.tsx | Deleted |

- Review each file before you continue.
- Keep the untracked panel out of the commit.

\`\`\`bash
npm test
\`\`\`

The changes are ready for review. The workspace keeps your current work intact.`;
const SPOKEN_REPLY = 'The changes are ready for review. The workspace keeps your current work intact.';
let chatStopped = false;
const calls: { command: string; args: unknown }[] = [];
// Every create_terminal request, so a test can read what was actually launched.
const spawned: any[] = [];
Object.assign(window, { fixtureSpawned: () => spawned });
Object.assign(window, { fixtureCalls: calls });
Object.assign(window, { fixtureSpeech: () => speech });
window.addEventListener('fixture-notifications', ((event: CustomEvent<number>) => {
 const history = Array.from({length:event.detail}, (_, index) => ({id:index + 1,category:'system' as const,severity:'info' as const,title:`Workspace update ${index + 1}`,at:Date.now(),count:1,read:false}));
 useNotificationStore.setState({history,unread:history.length});
}) as EventListener);
window.addEventListener('fixture-checkout', () => useConversationTerminals.setState({ open:['checkout'], sessions:[{id:'checkout',projectId:'studio',title:'Checkout experience',accountId:'default',status:'running'}] }));
window.addEventListener('fixture-worktree', () => useConversationTerminals.setState({ focused:'safe', sessions:[{id:'safe',projectId:'studio',title:'Safe task',accountId:'default',status:'running'}] }));
window.addEventListener('fixture-file-change', () => { files.push({path:`src/live${files.length}.ts`,status:' M',previousPath:null}); useWorkspaceStore.setState(s=>({fsVersion:s.fsVersion+1})); });
mockIPC(async (command, raw) => {
 const args = raw as Record<string, any>; calls.push({command,args});
 if (command === 'shared_chat_list') return useConversationTerminals.getState().sessions;
 if (command === 'shared_chat_request' && args.method === 'conversation.status') return {workingDirectory:args.params.sessionId === 'checkout'?'/Projects/Studio-checkout':'/Projects/Studio-worktree',turnState:args.params.sessionId === 'checkout'?'running':'completed',processState:'running'};
 if (command === 'workspace_worktrees') return {repository:'ellis/studio',worktrees:[{root:'/Projects/Studio',directory:'/Projects/Studio',branch:'main',isMain:true,available:true,upstream:'origin/main'},...['checkout','navigation','collection'].map((name,i)=>({root:`/Projects/Studio-${name}`,directory:`/Projects/Studio-${name}`,branch:`vibyra/${name}`,isMain:false,available:true,upstream:i===1?'origin/vibyra/navigation':null}))]};
 if (command === 'teammate_request') {
  if(args.path==='connectors'){const result=catalogue(); if(delayCatalogue) await new Promise(r=>setTimeout(r,500)); return result;}
  if(args.path.endsWith('/disconnect')){githubConnected=false;return catalogue();}
  if(args.path.endsWith('/start'))return {flowId:'123e4567-e89b-12d3-a456-426614174000'};
  githubConnected=true;return {status:'connected',catalogue:catalogue()};
 }
 if (command === 'preview_inspect') return {projectRoot:args.root,targets:[{id:'web',name:'Studio website',framework:'static',relativeRoot:'.',command:'Serve index.html locally',runnable:true,deviceHint:'phone',landscape:false}]};
 if (command.startsWith('preview_')) {
  if(command==='preview_start') { await new Promise(r=>setTimeout(r,150)); previewPhases[args.root]=new URLSearchParams(location.search).has('preview-error')?'failed':'running'; }
  if(command==='preview_stop') previewPhases[args.root]='stopped';
  return {phase:previewPhases[args.root]??'idle',targetId:'web',url:previewPhases[args.root]==='running'?'/sample-preview':null,command:null,logs:previewPhases[args.root]==='failed'?['Missing web dependencies: react-native-web']:[],error:previewPhases[args.root]==='failed'?'Expo exited with code 1':null};
 }
 if (command === 'fs_changes') return {root:'/Projects/Studio',files:[...files]};
 if (command === 'fs_change_preview') return `Working changes\n--- a/${args.path}\n+++ b/${args.path}\n@@ -1 +1 @@\n-old content\n+Live update ${files.length}`;
 if (command === 'fs_list_dir') return args.path.endsWith('/src')
  ? [{name:files.length > 4 ? 'live-created.ts' : 'App.tsx',path:`${args.path}/${files.length > 4 ? 'live-created.ts' : 'App.tsx'}`,isDir:false,size:24,modifiedMs:null}]
  : [{name:'README.md',path:`${args.path}/README.md`,isDir:false,size:24,modifiedMs:null},{name:'src',path:`${args.path}/src`,isDir:true,size:0,modifiedMs:null}];
 if (command === 'list_agents') return [
  {id:'codex',name:'Codex',program:'codex',args:[],env:[],accent:'#a5b4fc',description:'OpenAI Codex CLI',custom:false,installed:true},
  {id:'claude',name:'Claude Code',program:'claude',args:[],env:[],accent:'#d97757',description:'Anthropic Claude Code CLI',custom:false,installed:true},
  {id:'aider',name:'Aider',program:'aider',args:[],env:[],accent:'#4ade80',description:'Aider',custom:false,installed:false},
 ];
 // Codex launches as a conversation, like the rail's; recorded with the PTY launches.
 if (command === 'shared_chat_create') {
  spawned.push({agentId:args.options?.provider ?? 'codex',model:args.options?.model ?? null,permissionMode:args.options?.permissionMode,reasoningEffort:args.options?.reasoningEffort,cwd:'/Projects/Studio',projectId:args.projectId});
  return {id:`chat-${spawned.length}`,projectId:args.projectId,title:args.title,status:'running',accountId:'default',kind:args.options?.provider ?? 'codex'};
 }
 if (command === 'shared_chat_request' && args.method === 'turn.submit') return {status:'accepted'};
 if (command === 'create_terminal') {
  spawned.push(args.request);
  return {id:100 + spawned.length,title:`${args.request.agentId} ${spawned.length}`,agentId:args.request.agentId,cwd:args.request.cwd};
 }
 if (command === 'terminal_snapshot') return 'npm run build\n> studio@1.0.0 build\nBuilt in 1.2s';
 if (command === 'voice_status') return {recorder:true,keyConfigured:true};
 if (command === 'voice_start') { listeningSince = Date.now(); return null; }
 if (command === 'voice_level') {
  const elapsed = Date.now() - listeningSince;
  const speaking = !query.has('silent') && elapsed < SPOKE_MS;
  return { recording: listeningSince > 0, metered: true, rms: speaking ? 0.3 : 0.001, seconds: elapsed / 1000 };
 }
 if (command === 'voice_stop') { listeningSince = 0; return args.discard ? null : 'Please review these changes.'; }
 if (command === 'speech_start') {
  if (query.has('slow-speech')) await new Promise(resolve=>setTimeout(resolve,200));
  speech=args.id; speechSince=Date.now(); return null;
 }
 if (command === 'speech_stop') { if (speech === args.id) speech=null; return null; }
 if (command === 'speech_voices') return [{id:'alloy',locale:'multilingual'},{id:'nova',locale:'multilingual'}];
 if (command === 'speech_active') {
  if (query.has('speech-ends') && speech === args.id && Date.now() - speechSince > SPOKE_REPLY_MS) speech = null;
  return speech===args.id;
 }
 if (command === 'load_memory') return '';
 if (command === 'project_brief') return {text:'Project: Studio at /Projects/Studio\nBranch: main, up to date with origin/main.\nScripts: dev, build, test.',shape:'repository',codebase:true,chars:112,truncated:[]};
 if (command === 'search_memory_sources') return [];
 if (command === 'ai_chat_stop') { chatStopped = true; return null; }
 if (command === 'ai_chat') {
  // Tauri rejects a command with a plain string, and the chat shows exactly that.
  if (query.has('no-key')) throw 'Add your OpenAI API key in Settings › Vibyra AI, or set OPENAI_API_KEY, to use chat.';
  // ?act=<tool>:<json> makes the first reply ask Vibyra to do something, the
  // way a real model would. The second pass has no tools and just talks.
  const act = query.get('act');
  // Only the person's question is scripted into a call; the follow-up passes
  // (which carry tools too, now) just talk, as a model with nothing left to do.
  const last = String(args.messages?.at(-1)?.content ?? '');
  if (act && args.tools && !/^Vibyra ran those actions/.test(last)) {
   const [name, ...rest] = act.split(':');
   return {text:'',stopped:false,toolCalls:[{id:'call_1',name,arguments:rest.join(':') || '{}'}]};
  }
  chatStopped = false;
  // A reply asked for out loud comes back written to be heard, so the voice
  // turns are never handed a table to read.
  const spoken = /spoken aloud/.test(String(args.messages?.[0]?.content ?? ''));
  const reply = spoken ? SPOKEN_REPLY : CHAT_REPLY;
  const words = reply.match(/\S+\s*/g) ?? [];
  // The real stream pauses before its first token, and the waiting state would
  // otherwise only ever flash.
  if (query.has('slow-chat')) await new Promise(resolve=>setTimeout(resolve,900));
  let sent = '';
  for (let at = 0; at < words.length; at++) {
   if (chatStopped) return {text:sent.trim(),stopped:true,toolCalls:[]};
   await new Promise(resolve=>setTimeout(resolve,query.has('slow-chat')?60:8));
   if (query.has('chat-error') && sent.length > reply.length/3) throw 'The assistant stopped responding. Check your connection and try again.';
   sent += words[at];
   // The last word never crosses the channel: the returned text is the
   // authority, and a renderer that only concatenated deltas would end short.
   if (at < words.length - 1) args.onEvent.onmessage({text:words[at]});
  }
  return {text:reply,stopped:false,toolCalls:[]};
 }
 return null;
});
useSettingsStore.setState({settings:{projects:[{id:'studio',name:'Studio',root:'/Projects/Studio'}],fontSize:13,fontFamily:'monospace',theme:query.get('theme')??'dark',openaiKeyConfigured:!query.has('no-key'),voiceShortcut:'F8',screenshotShortcut:'F9',talkShortcut:'F10',speechVoice:'nova'} as any});
useProjectStore.setState({activeId:'studio',view:'project'});
useAccountStore.setState({snapshot:{status:'signedIn',profile:{email:'test@example.test'}} as any});
useWorkspaceStore.setState({root:'/Projects/Studio',companionOpen:true,companionTab:'chat',companionSize:'compact'});
useChatStore.setState({threads:{studio:[{id:'seed-u',role:'user',content:'What changed in the workspace?',status:'complete',createdAt:0},{id:'seed-a',role:'assistant',content:'The chat layout is clearer, and file changes update as you work. You can review each file before continuing.',status:'complete',createdAt:0,replyTo:'seed-u'}]}});
function ConnectorSyncFixture() {
 const {disconnect,connect}=useConnectors();
 useEffect(()=>{const action=()=>{void connect('github');};window.addEventListener('fixture-settings-connect',action);return()=>window.removeEventListener('fixture-settings-connect',action);},[connect]);
 useEffect(()=>{const action=()=>{void disconnect('github');};window.addEventListener('fixture-settings-disconnect',action);return()=>window.removeEventListener('fixture-settings-disconnect',action);},[disconnect]);
 return null;
}
async function mountFixture() {
 const workspace = query.has('real-workspace') ? await import('./aiSidebarFixture') : null;
 workspace?.prepareAiSidebarFixture();
 const code = <div className="product-code-shell" style={{flex:1,minHeight:0}}>
  {query.has("navigation") && <ProjectStrip/>}
  {workspace ? <div style={{display:'contents'}}><workspace.AiSidebarWorkspace/></div>
    : <main className="project-workspace" style={{position:'relative',flex:1}}><div style={{padding:40,color:'var(--dim)'}}>Studio workspace</div><Companion/></main>}
 </div>;
 createRoot(document.getElementById('root')!).render(<div className={workspace ? 'app' : undefined} style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  {query.has('connector-sync') && <ConnectorSyncFixture/>}<TitleBar/>
  {workspace ? <div className="shell">{code}</div> : code}
  <VoiceHud/>{query.has("error-test") && <Toasts/>}
 </div>);
}
void mountFixture();
