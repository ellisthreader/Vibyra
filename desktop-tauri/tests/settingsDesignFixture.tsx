import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useSettingsStore } from '../src/state/settingsStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useAccountStore } from '../src/state/accountStore';
import { usePhoneStore } from '../src/state/phoneStore';
import { useRemoteSecurity } from '../src/state/remoteSecurityStore';
import { DEFAULT_NOTIFICATIONS } from '../src/lib/notificationPrefs';
import type { Settings } from '../src/types';
import type { RemoteSecuritySnapshot } from '../src/ipc/remoteSecurity';

// Real settings stores and save queue; native commands are isolated sample data.
mockWindows('main');
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
let saved = {
  theme: query.has('light') ? 'light' : 'dark', agentView: 'terminal', fontSize: 13,
  fontFamily: 'JetBrains Mono', scrollbackLines: 5000, rendererMode: 'auto',
  performanceMode: 'balanced', persistTerminalScrollback: true, sendProjectContext: true,
  enabledAgentIds: [], projects: [], customAgents: [], notifications: DEFAULT_NOTIFICATIONS,
  voiceShortcut: 'F8', screenshotShortcut: 'F9', talkShortcut: 'F10',
  speechVoice: 'nova', speechRate: 1, speechStyle: '', voiceLanguage: '', talkPauseMs: 1100,
} as unknown as Settings;
const scope = { accountScope: 'settings-design', hostId: 'mac-fixture' };
const data: RemoteSecuritySnapshot = {
  scope, computer: { id: scope.hostId, name: 'Ellis’s MacBook Air', online: true },
  security: { mode: 'trusted', enabled: true }, pendingDevices: [], pendingSessions: [],
  devices: [], sessions: [],
  passkeys: [{ id: 1, device_name: 'iPhone', created_at: '2026-10-05T12:00:00Z', last_used_at: null }],
  events: Array.from({ length: 7 }, (_, i) => ({
    id: `event-${i}`, title: i % 2 ? 'Remote session ended' : 'Remote device revoked',
    createdAt: `2026-10-05T${String(15 - i).padStart(2, '0')}:19:00Z`, metadata: { device: 'iPhone' },
  })),
};
const calls: { command: string; payload: unknown }[] = [];
let failSave = false;
mockIPC((command, payload) => {
  calls.push({ command, payload });
  if (command === 'get_settings') return saved;
  if (command === 'save_settings') {
    if (failSave) throw new Error('Fixture save refused');
    saved = (payload as { settings: Settings }).settings; return null;
  }
  if (command === 'remote_security_snapshot') return structuredClone(data);
  if (command === 'remote_security_set_mode') data.security!.mode = (payload as { mode: 'ask' }).mode;
  if (command === 'remote_security_revoke') {
    const request = payload as { kind: string; id: string };
    if (request.kind === 'passkey') data.passkeys = data.passkeys.filter(key => String(key.id) !== request.id);
  }
  if (command === 'shell_autostart_get') return false;
  if (command === 'renderer_policy') return { configurable: false, mode: 'auto', active: 'accelerated' };
  if (command === 'speech_voices') return [{ id: 'nova', locale: 'multilingual' }];
  if (command === 'plugin:notification|is_permission_granted') return true;
  if (command === 'memory_sources' || command === 'chat_connectors') return [];
  return null;
});
useSettingsStore.setState({ settings: saved });
useAccountStore.setState({ snapshot: { status: 'signedIn', profile: { welcomeKey: scope.accountScope, name: 'Ellis' }, secureStorage: true } } as never);
usePhoneStore.setState({ status: { enabled: true, devices: [], active: [], pending: [], remote: { enabled: true, leg: { state: 'online' } } } } as never);
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'general', settingsPanel: null });
Object.assign(window, {
  settingsDesign: {
    calls, data,
    settings: () => useSettingsStore.getState().settings,
    reload: () => useSettingsStore.getState().load(),
    refresh: () => useRemoteSecurity.getState().refresh(),
    open: (section: ReturnType<typeof useWorkspaceStore.getState>['settingsSection']) => useWorkspaceStore.setState({ settingsSection: section }),
    failSave: (next: boolean) => { failSave = next; },
  },
});
createRoot(document.getElementById('root')!).render(<SettingsModal />);
