import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { useAccountStore } from '../src/state/accountStore';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/project-focus.css';
import '../src/styles/strip.css';
import '../src/styles/teammates.css';
if (location.search.includes('light')) document.documentElement.dataset.theme = 'light';
const computer = location.search.includes('computer');
useAccountStore.setState({snapshot:{status:'signedIn',profile:{email:'profile@example.test'},secureStorage:true} as any});
let saved: any; let skills: any[] = [{id:'skill-review',revision:1,name:'Review checklist',instructions:'Explain risks and cite sources.',teammateIds:[]}];
let computerGrant: any = null;
// F-31: mirrors the Mac. It opens the picker (`fixturePick` sets what the person picks), grants nothing for a broad folder
// until the renderer confirms, and then only read-only. A confirmation names no folder, only the one it asked about.
let computerPick = '/fixture/project', pendingBroad = ''; const chooseCalls: any[] = [];
const broadKind = (path: string) => path === '/' ? 'root' : path === '/Users/fixture' ? 'home' : path === '/Users/fixture/Documents' ? 'broad' : null;
Object.assign(window,{fixtureComputer:()=>computerGrant,fixtureChooseCalls:()=>chooseCalls,fixturePick:(path: string)=>{computerPick=path;}});
mockIPC(async (command, args: any) => {
 if(command === 'agent_computer_grants') return computerGrant ? [computerGrant] : [];
 if(command === 'agent_computer_choose') {
  chooseCalls.push(structuredClone(args)); const confirmed = args.confirmBroad === true;
  if(confirmed && !pendingBroad) throw 'That confirmation expired. Choose the folder again.';
  const path = confirmed ? pendingBroad : computerPick, kind = broadKind(path); if(!confirmed) pendingBroad = '';
  if(kind && !confirmed) { pendingBroad = path; return {broad:kind,path,label:path.split('/').filter(Boolean).at(-1) ?? 'Folder'}; }
  pendingBroad = ''; computerGrant = {id:'fixture-computer-grant',agentId:args.agentId,label:'Fixture project',path,canWrite:args.allowEdits&&!confirmed,canTest:args.allowTests&&!confirmed,revoked:false}; return computerGrant;
 }
 if(command === 'agent_computer_revoke') { computerGrant = null; return {ok:true}; }
 if(command !== 'teammate_request') return null;
 if(args.path === 'vibes/models') return {models:[{id:'anthropic/claude-test',name:'Claude Test',available:true}]};
 if(args.path === 'agents/v1/skills') { if (!args.body) return {skills}; const skill = {...args.body,revision:1}; skills = [skill,...skills.filter(s=>s.id!==skill.id)]; Object.assign(window,{createdSkill:skill}); return {skill}; }
 if(args.path === 'agents/v1/teammates' && !args.body) return {version:1,enabled:true,capabilities:computer?{localComputer:true,vmTests:true}:undefined,teammates:saved?[saved]:[]};
 if(args.path === 'connectors') return {enabled:true,integrations:[{id:'github',name:'GitHub',installed:true,reads:'Repositories and pull requests',writes:null,credential:{configured:true}}]};
 if(args.path === 'vibes/wallet') return {wallet:{consented:true}};
 if(args.path.endsWith('/turns')) return {turns:[]};
 if(args.body){saved={...args.body,id:saved?.id??args.body.id,chatId:'fixture-chat',revision:(saved?.revision??0)+1,archived:false,status:'idle',updatedAt:new Date().toISOString()};Object.assign(window,{savedProfile:saved});return {teammate:saved};}
 throw new Error('Unsupported fixture request');
});
createRoot(document.getElementById('root')!).render(<div style={{display:'flex',height:'100%'}}><TeammatesWorkspace active /></div>);
