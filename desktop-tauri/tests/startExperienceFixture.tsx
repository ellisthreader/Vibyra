import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { HomeView } from '../src/components/home/HomeView';
import { AuthScreen } from '../src/components/auth/AuthScreen';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { TitleBar } from '../src/components/layout/TitleBar';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import { usePhoneStore } from '../src/state/phoneStore';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
if (query.has('performance')) document.documentElement.dataset.performance = 'on';
mockWindows('main'); mockIPC(() => null);
const events: unknown[] = [];
Object.assign(window, { startEvents: events, startView: () => useProjectStore.getState().view });
const projects = query.has('empty') ? [] : [
  { id: 'studio', name: 'Studio website', root: '/Users/ellis/Projects/studio', color: '#5b7cfa', lastOpenedMs: Date.now() - 60000 },
  { id: 'vibyra', name: 'Vibyra', root: '/Users/ellis/Projects/vibyra', color: '#37c78a', lastOpenedMs: Date.now() - 3600000 },
  { id: 'journal', name: 'Personal journal', root: '/Users/ellis/Projects/journal', color: '#e8a94b', lastOpenedMs: Date.now() - 86400000 },
];
useAccountStore.setState({ snapshot: { status: query.has('auth') ? 'signedOut' : 'signedIn', profile: { name: query.get('name') ?? 'Barbara', email: 'barbara@example.test', plan: 'free' }, secureStorage: true, error: null, pendingProvider: null } as any });
useAccountStore.setState({
  startOauth: async provider => { events.push(['oauth', provider]); },
  cancelOauth: async () => { events.push(['cancel-oauth']); },
  loginEmail: async (email, password) => { events.push(['login', email, password]); },
  signupEmail: async (name, email, password) => { events.push(['signup', name, email, password]); },
  forgotPassword: async email => { events.push(['forgot', email]); return 'Reset link sent.'; },
});
useSettingsStore.setState({ settings: { projects, theme: 'dark', fontSize: 13 } as any });
useProjectStore.setState({ homeDir: '/Users/ellis', view: 'home', activeId: null,
  activate: async id => { events.push(['activate', id]); },
  pickAndCreate: async () => { events.push(['open-folder']); return null; },
});
useConversationTerminals.setState({ loaded: true, sessions: [], open: [] });
usePhoneStore.setState({ status: { enabled: false, discoverable: false, active: [], devices: [], pending: [], error: null, address: '' } });
useTerminalStore.setState({ panes: query.has('empty') ? [] : [
  { id: 1, projectId: 'studio', title: 'Give the homepage a fresh start', agentId: 'codex', status: 'suspended', lastFocusedAt: Date.now() - 60000, accent: '#5b7cfa' },
  { id: 2, projectId: 'vibyra', title: 'Polish the onboarding experience', agentId: 'claude', status: 'running', lastFocusedAt: Date.now() - 3600000, accent: '#888' },
] as any, activity: { 2: 'working' }, setFocus: id => { events.push(['focus', id]); } });
createRoot(document.getElementById('root')!).render(query.has('auth') ? <AuthScreen /> :
  <div className="app" style={{ height: '100vh' }}><TitleBar /><div className="shell"><div className="product-code-shell"><ProjectStrip /><HomeView /></div></div></div>);
