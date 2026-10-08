import { useState } from 'react';
import { NotificationBell } from '../src/components/notifications/NotificationBell';
import type { NotificationItem } from '../src/notificationTypes';
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
if (query.has('performance')) document.documentElement.dataset.performance = 'best';
mockWindows('main');
// Two agent chats in the most recent project: one mid-run, one finished.
const ask = (turnId: string, text: string) => ({ id: `u-${turnId}`, turnId, kind: 'message', role: 'user', text, startedAt: new Date(Date.now() - 53000).toISOString() });
const chats: Record<string, unknown> = {
  'chat-work': { sessionId: 'chat-work', projectId: 'studio', generation: 'g', cursor: 3, processState: 'running', turnState: 'running', turnId: 't1', hasMore: false, settings: { provider: 'codex', model: 'gpt-6-astra', effort: null, approvalPolicy: null, revision: 1, appliesTo: 'next' },
    items: [ask('t1', 'Run audit of code base'), { id: 'a1', turnId: 't1', kind: 'activity', title: 'Running command', command: `/bin/zsh -lc "rg -n 'adopt_session' src/account_login.rs"` }] },
  'chat-done': { sessionId: 'chat-done', projectId: 'studio', generation: 'g', cursor: 4, processState: 'running', turnState: 'completed', turnId: 't2', hasMore: false, settings: { provider: 'codex', model: 'gpt-6-astra', effort: null, approvalPolicy: null, revision: 1, appliesTo: 'next' },
    items: [ask('t2', 'Audit the app, do not edit code'), { id: 'm2', turnId: 't2', kind: 'message', role: 'assistant', text: 'Found **six additional issues**. No app code changed.' }, { id: 'r2', turnId: 't2', kind: 'result', title: 'Finished', durationMs: 203459, updatedAt: new Date(Date.now() - 480000).toISOString() }] },
};
mockIPC((cmd, args) => {
  if (cmd !== 'shared_chat_request') return null;
  const { method, params } = args as { method: string; params: { sessionId: string } };
  const chat = chats[params.sessionId] as { cursor: number; generation: string } | undefined;
  return method === 'conversation.events' ? { cursor: chat?.cursor ?? 0, generation: 'g' } : chat ?? null;
});
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
useConversationTerminals.setState({ loaded: true, open: [], sessions: query.has('empty') ? [] : [
  { id: 'chat-work', projectId: 'studio', title: 'GPT-6 Astra', status: 'running', kind: 'codex', accountId: 'default', createdAt: '2026-10-05T10:15:00Z' },
  { id: 'chat-done', projectId: 'studio', title: 'GPT-6 Astra', status: 'running', kind: 'codex', accountId: 'default', createdAt: '2026-10-05T10:14:00Z' },
] });
usePhoneStore.setState({ status: { enabled: false, discoverable: false, active: [], devices: [], pending: [], error: null, address: '' } });
useTerminalStore.setState({ panes: query.has('empty') ? [] : [
  { id: 1, projectId: 'studio', title: 'Give the homepage a fresh start', agentId: 'codex', status: 'suspended', lastFocusedAt: Date.now() - 60000, accent: '#5b7cfa' },
  { id: 2, projectId: 'vibyra', title: 'Polish the onboarding experience', agentId: 'claude', status: 'running', lastFocusedAt: Date.now() - 3600000, accent: '#888' },
] as any, activity: { 2: 'working' }, setFocus: id => { events.push(['focus', id]); }, resume: async id => { events.push(['resume', id]); } });
function NotificationFixture() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(Array.from({ length:12 }, (_, id) => ({
    id, at:Date.now() - id * 3600000, read:false, count:1, category:'performance', severity:'warning',
    title:id === 2 ? 'A longer notification title that must wrap without overlapping the next message' : 'Your machine is under load',
    body:id === 2 ? 'A long message with enough detail to take several lines in a narrow notification panel. Everything should remain readable.' : 'Vibyra may feel laggy until this settles.',
    action:{ id:'hibernateIdleTerminals', label:'Hibernate idle terminals' },
  })));
  return <div className="app"><header className="chrome" style={{ justifyContent:'flex-end', paddingRight:16 }}>
    <NotificationBell items={items} unread={items.filter(item => !item.read).length} open={open} onOpenChange={setOpen}
      onMarkAllRead={() => setItems(list => list.map(item => ({ ...item, read:true })))}
      onClearAll={() => setItems([])} onDismiss={id => setItems(list => list.filter(item => item.id !== id))} onOpenSettings={() => events.push(['notification-settings'])}
      onAction={item => events.push(['notification-action', item.id])} />
  </header></div>;
}
createRoot(document.getElementById('root')!).render(query.has('notifications') ? <NotificationFixture /> : query.has('auth') ? <AuthScreen /> :
  <div className="app" style={{ height: '100vh' }}><TitleBar /><div className="shell"><div className="product-code-shell"><ProjectStrip /><HomeView /></div></div></div>);
