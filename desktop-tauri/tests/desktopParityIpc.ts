const calls: unknown[] = [];
Object.assign(window, { parityCalls:calls });
export async function parityIpc(command: string, args: any) {
  calls.push([command,args]);
  if (command === 'plugin:window|is_focused') return true;
  if (command === 'plugin:window|is_maximized') return false;
  if (command === 'plugin:event|listen') return 1;
  if (command === 'plugin:notification|is_permission_granted') return false;
  if (command === 'shared_chat_list' || command === 'list_agents' || command === 'provider_accounts_list' || command === 'fs_list_dir') return [];
  if (command === 'phone_status') return {enabled:false,typing:false,discoverable:false,address:'',active:[],devices:[],pending:[],error:null};
  if (command === 'renderer_policy') return {mode:'auto',softwareCompositing:false,nvidiaSession:false,configurable:/Linux/.test(navigator.platform),environmentOverride:false};
  if (command === 'voice_status') return {recorder:true,keyConfigured:false};
  if (command === 'fs_changes') return {root:'/fixture/studio',files:[]};
  if (command === 'project_brief') return {text:'Studio sample project',shape:'repository',codebase:true,chars:21,truncated:[]};
  if (command === 'preview_inspect') return {projectRoot:'/fixture/studio',targets:[]};
  if (command.startsWith('preview_')) return {phase:'idle',targetId:null,url:null,command:null,logs:[],error:null};
  if (command === 'workspace_worktrees') return {repository:'sample/studio',worktrees:[]};
  if (command === 'account_devices') return {devices:[]};
  if (command === 'teammate_request') {
    if (args.path === 'agents/v1/teammates') return {version:1,enabled:true,teammates:[{id:'review',chatId:'review-chat',revision:1,name:'Code reviewer',brief:'Review changes',memory:'',avatar:'review',budget:10,integrations:[],archived:false,status:'idle',lastMessage:'Ready to help.',updatedAt:'2026-09-21T09:41:00Z'}]};
    if (args.path === 'connectors') return {enabled:true,integrations:[]};
    if (args.path === 'agents/v1/skills') return {skills:[]};
    if (args.path === 'vibes/models') return {models:[]};
    if (args.path === 'vibes/wallet') return {wallet:{consented:true}};
    if (args.path.endsWith('/turns')) return {turns:[]};
  }
  return null;
}
