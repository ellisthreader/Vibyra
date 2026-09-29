import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { palettes, ThemeContext } from '../src/theme';
import { RemoteSecurityPage } from '../src/settings/pages/RemoteSecurityPage';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { RemoteDashboardApi } from '../src/remote/dashboardApi';
import type { WorkspaceModel } from '../src/ui/types';
import { runtimeHarness } from './runtimeHarness';
import { remoteSecurityDashboard } from '../src/state/remoteSecurityActions';
const dark = new URLSearchParams(location.search).get('theme') === 'dark';
const offline = new URLSearchParams(location.search).has('offline');
const calls: string[] = []; (window as any).securityCalls = calls;
let revoked = false, disconnected = false, disabled = false, removed = false;
const api: RemoteDashboardApi = {
  identity: () => 'account',
  passkeys: async () => removed ? [] : [{ id: 12, device_name: 'iPhone passkey', created_at: '2026-09-29T10:00:00Z', last_used_at: null }],
  removePasskey: async () => { removed = true; calls.push('remove-passkey'); },
  devices: async () => [{ id: 'device', hostId: 'a'.repeat(64), publicKey: 'a'.repeat(64), deviceName: "Ellis’s iPhone", pairingCode: '123456',
    permissions: ['terminal:access'],
    approvedAt: '2026-09-29T10:00:00Z', revokedAt: revoked ? '2026-09-29T10:01:00Z' : null, deniedAt: null, requestExpiresAt: null }],
  sessions: async () => disconnected ? [] : [{ id: 'session', hostId: 'a'.repeat(64), clientName: "Ellis’s iPhone", status: 'CONNECTED', permissions: ['terminal:access'], connectedAt: '2026-09-29T10:00:00Z', expiresAt: null }],
  events: async () => [{ id: 'event', title: 'Remote access started', eventType: 'REMOTE_SESSION_STARTED', createdAt: new Date().toISOString(), read: false }],
  readEvent: async () => { calls.push('read'); },
  revoke: async () => { revoked = true; calls.push('revoke'); },
  revokeAll: async () => { revoked = true; disconnected = true; calls.push('revokeAll'); },
  disconnect: async () => { disconnected = true; calls.push('disconnect'); },
  disconnectAll: async () => { disconnected = true; calls.push('disconnect-all'); },
  disable: async () => { calls.push('disable'); if (offline) throw new Error('API unavailable'); disabled = true; disconnected = true; },
};
const { store } = runtimeHarness();
store.token = 'account';
store.saved = { pairing: { version: 1, hostId: 'a'.repeat(64), publicKey: 'a'.repeat(64), name: 'Home Desktop', url: 'wss://relay.test', route: 'relay' }, privateKey: 'b'.repeat(64), autoConnect: true };
store.cloudSecurityScope = { owner: 'account', hostId: 'a'.repeat(64), deviceId: 'device', sessionId: 'session' };
store.update({ status: 'connected', throughCloud: true });
(window as any).securityLocalState = () => ({ status: store.state.status, autoConnect: store.saved?.autoConnect });
const workspace = { ...fixtureWorkspace, demo: false, remoteAccess: remoteSecurityDashboard(store, api),
  account: { email: 'ellis@example.com', name: 'Ellis', plan: 'pro' },
  actions: { ...fixtureWorkspace.actions, disconnect: async () => { calls.push('local-disconnect'); },
    listComputers: async () => ({ live: true, entitled: true, computers: [{ id: 'a'.repeat(64), name: 'Home Desktop', platform: 'macos', version: null, online: !disabled, lastSeenAt: null, activeSessions: disconnected ? 0 : 1 }] }) } } as WorkspaceModel;
createRoot(document.getElementById('root')!).render(<ThemeContext.Provider value={{ colors: palettes[dark ? 'dark' : 'light'], dark }}>
  <View style={{ flex: 1, backgroundColor: palettes[dark ? 'dark' : 'light'].rail }}>
    <Text style={{ padding: 20, fontSize: 22, color: palettes[dark ? 'dark' : 'light'].text }}>Remote access</Text>
    <RemoteSecurityPage workspace={workspace} nav={{} as any} routes={{} as any} />
  </View>
</ThemeContext.Provider>);
