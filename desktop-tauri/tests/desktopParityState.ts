import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useProductMode } from '../src/state/productModeStore';
import { usePhoneStore } from '../src/state/phoneStore';
import { useChatStore } from '../src/state/chatStore';
import { useAgentStore } from '../src/state/agentStore';
import { DEFAULT_NOTIFICATIONS } from '../src/lib/notificationPrefs';
import { parityIpc, sampleAgents, samplePaneNames } from './desktopParityIpc';

const query = new URLSearchParams(location.search);
export const parityScreen = query.get('screen') ?? 'workspace';
export function paritySnapshots() {
  return [useAccountStore, useSettingsStore, useProjectStore, useTerminalStore,
    useConversationTerminals, useWorkspaceStore, useProductMode, usePhoneStore, useChatStore]
    .map(store => Object.fromEntries(Object.entries(store.getState()).filter(([, value]) => typeof value !== 'function')));
}
export function seedParityFixture() {
  const theme = query.get('theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.platform = /Mac/.test(navigator.platform) ? 'mac' : 'linux';
  document.documentElement.dataset.theme = theme;
  mockWindows('main');
  mockIPC(parityIpc);
  const projects = [{ id:'studio', name:'Studio', root:'/fixture/studio', color:'#5b7cfa', lastOpenedMs:0 }];
  useAccountStore.setState({ snapshot:{status:parityScreen === 'auth' ? 'signedOut' : 'signedIn', profile:{name:'Barbara',email:'fixture@example.test',plan:'free',welcomeKey:'vw_parity_fixture'},secureStorage:true,error:null,pendingProvider:null} as any });
  useSettingsStore.setState({ settings:{projects,theme,fontSize:13,fontFamily:'monospace',scrollbackLines:5000,
    customAgents:[],enabledAgentIds:[],agentView:'terminal',defaultShell:null,workspaceRoot:null,screenshotDir:null,
    screenshotHideWindow:false,openaiKeyConfigured:false,secureStorageAvailable:true,voiceShortcut:'F8',screenshotShortcut:'F9',
    rendererMode:'auto',performanceMode:false,persistTerminalScrollback:true,notifications:DEFAULT_NOTIFICATIONS,
    aiDailyCallCap:250,aiHourlyCallCap:60,aiDailySpendCapUsd:2,aiMonthlySpendCapUsd:20,activeProjectId:'studio'} as any,
    update:async partial => useSettingsStore.setState(s => ({settings:{...s.settings!,...partial}})),
    commit:partial => useSettingsStore.setState(s => ({settings:{...s.settings!,...partial}})),
  });
  useProductMode.setState({mode:parityScreen === 'agents' ? 'agent' : 'work'});
  useProjectStore.setState({activeId:'studio',homeDir:'/fixture',view:parityScreen === 'home' ? 'home' : parityScreen === 'new-project' ? 'new-project' : 'project'});
  usePhoneStore.setState({status:{enabled:false,typing:false,discoverable:false,address:'',active:[],devices:[],pending:[],error:null}});
  useAgentStore.setState({agents:sampleAgents,loaded:true});
  useConversationTerminals.setState({loaded:true,sessions:[],open:[]});
  useWorkspaceStore.setState({root:'/fixture/studio',companionOpen:['chat','files','preview'].includes(parityScreen),
    companionTab:parityScreen === 'files' ? 'files' : parityScreen === 'preview' ? 'preview' : 'chat',companionSize:'compact',
    settingsOpen:parityScreen.startsWith('settings-'),settingsSection:parityScreen.replace('settings-','') as any,settingsPanel:null});
  useTerminalStore.setState({focusedId:1,panes:samplePaneNames.map((title,i) => ({id:i+1,projectId:'studio',agentId:i===2?'shell':'codex',title,
    status:'suspended',visibility:'visible',snapshot:'$ npm run build\r\n\r\nStudio\r\nBuild completed successfully.\r\n\r\nReady for the next task.',accent:'#888',model:null})) as any});
  useChatStore.setState({threads:{studio:[{id:'u',role:'user',content:'What changed?',status:'complete',createdAt:0},{id:'a',role:'assistant',content:'The navigation is clearer.\n\n| File | Change |\n| --- | --- |\n| App.tsx | Updated |',status:'complete',replyTo:'u',createdAt:0}]}});
}
