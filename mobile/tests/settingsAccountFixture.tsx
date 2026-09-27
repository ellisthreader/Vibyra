import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { createAccountApi } from '../src/account/accountApi';
import { restoreAccount } from '../src/account/accountActions';
import { deleteWithProvider } from '../src/account/providerDeletion';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import type { IntegrationsApi } from '../src/integrations/types';
import type { SettingsPageId } from '../src/settings/pages';
import { SettingsSheet } from '../src/settings/SettingsSheet';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { paletteFor, ThemeContext } from '../src/theme';
import { RpcClient } from '../src/transport/RpcClient';
import { VibesProvider } from '../src/vibes/VibesProvider';

// The account pages over a real WorkspaceStore whose account API talks to a
// pretend server below, so each page is driven through the actions and HTTP calls
// the app makes. `?provider=email|google|apple`, `?verified=0`, `?page=` opens
// straight to a page, `?theme=light`. Every request is logged on `window.accountCalls`.
const query = new URLSearchParams(location.search);
const provider = (query.get('provider') ?? 'email') as 'email' | 'google' | 'apple';
const calls: string[] = [];
const photos: { type: string; size: number }[] = [];
Object.assign(window, { accountCalls: calls, accountPhotos: photos });
let user = { id: 1, email: 'ellis@example.com', name: 'Ellis', plan: 'pro', provider,
  emailVerified: query.get('verified') !== '0', avatarUrl: null as string | null };
const hour = 3600 * 1000;
let devices = [
  { id: 'this-phone', deviceName: 'iPhone', location: 'London, GB', updatedAt: new Date().toISOString(), current: true },
  { id: 'mac', deviceName: 'MacBook Pro', location: 'London, GB', updatedAt: new Date(Date.now() - 3 * hour).toISOString(), current: false },
  { id: 'web', deviceName: 'Vibyra web', location: 'Manchester, GB', updatedAt: new Date(Date.now() - 50 * hour).toISOString(), current: false },
];
let polls = 0;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function server(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const path = new URL(String(input)).pathname;
  const method = init.method ?? 'GET';
  calls.push(`${method} ${path}`);
  // A real server takes a moment, so busy states are drawn and can be seen.
  await new Promise(resolve => setTimeout(resolve, 150));
  const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, string> : {};
  if (path === '/api/account/profile') {
    user = { ...user, ...body, ...(body.email ? { emailVerified: false } : {}) };
    return reply(200, { ok: true, user });
  }
  if (path === '/api/account/avatar') {
    const photo = method === 'POST' ? (init.body as FormData).get('photo') as Blob : null;
    if (photo) photos.push({ type: photo.type, size: photo.size });
    user = { ...user, avatarUrl: photo ? URL.createObjectURL(photo) : null };
    return reply(200, { ok: true, user });
  }
  if (path === '/api/account/sessions') return method === 'GET' ? reply(200, { ok: true, devices, sessions: [] })
    : reply(200, { ok: true, currentRevoked: true });
  if (path.startsWith('/api/account/devices/')) {
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    devices = devices.filter(item => item.id !== id);
    return reply(200, { ok: true, currentRevoked: id === 'this-phone' });
  }
  if (path === '/api/auth/password/forgot') return reply(200, { ok: true, message: 'If that email belongs to a Vibyra password account, a reset link has been sent.' });
  if (path === '/api/auth/email/resend') return reply(200, { ok: true, message: 'If that email still needs verification, a new link has been sent.' });
  if (path === '/api/account' && method === 'DELETE')
    return body.password === 'right-one' ? reply(200, { ok: true }) : reply(401, { ok: false, error: 'Password is incorrect.' });
  if (path.endsWith('/start')) return reply(200, { ok: true, flowId: 'flow-1', expiresIn: 600,
    authUrl: provider === 'apple' ? 'https://appleid.apple.com/auth/authorize?state=s' : 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
  if (path.includes('/status/')) return reply(200, ++polls < 2 ? { ok: true, status: 'pending' } : { ok: true, status: 'complete', deleted: true });
  return reply(404, { message: 'Not Found' });
}
// The provider pop-up: opened, pointed at the provider, then left open like a person would.
window.open = (() => {
  calls.push('popup');
  const popup = { closed: false, opener: null, location: { href: '' }, close() { popup.closed = true; } };
  return popup;
}) as unknown as typeof window.open;
const api = createAccountApi({ baseUrl: 'https://api.example.test', deviceName: 'Vibyra web', fetch: server as typeof fetch });
const memory = new Map<string, string>();
const storage = { read: async (key: string) => memory.get(key) ?? null,
  write: async (key: string, value: string) => { memory.set(key, value); }, delete: async (key: string) => { memory.delete(key); } };
const store = new WorkspaceStore({ rpc: new RpcClient(() => {}, () => crypto.randomUUID()), storage, flags: storage,
  uuid: () => crypto.randomUUID(),
  account: { ...api, providerDeletion: (which, token, signal) => deleteWithProvider(api, which, token, signal) } });
const { id: _id, ...account } = user;
void restoreAccount(store, JSON.stringify({ token: 'tok', ...account }));
store.update({ onboarding: { status: 'complete', mode: null } });
const catalogue = { enabled: true, integrations: fallbackIntegrations.map((item, index) => ({ ...item, installed: index < 2 })) };
const integrations: IntegrationsApi = { catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue };
const vibesApi = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, plan: 'pro', available: 1240, total: 1240 }) };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const noop = () => { calls.push('route'); };

function Fixture() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [visible, setVisible] = useState(true);
  const dark = query.get('theme') !== 'light';
  const colors = paletteFor(dark, 'cobalt');
  const workspace = { ...state, themePreference: dark ? 'dark' as const : 'light' as const, actions: store.actions };
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider><SafeAreaInsetsContext.Provider value={insets}>
      <VibesProvider api={vibesApi} identity={state.account?.email ?? null} purchases={null}>
        <IntegrationsProvider api={integrations} identity={state.account?.email ?? null}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
            <Text testID="fixture-signed" style={{ color: colors.text, padding: 20 }}>
              {state.account ? `Signed in as ${state.account.email}` : 'Signed out'}</Text>
            <SettingsSheet visible={visible} workspace={workspace} onClose={() => { calls.push('close'); setVisible(false); }}
              initialPage={query.get('page') as SettingsPageId | null}
              routes={{ plugins: noop, wallet: noop, remote: noop, connect: noop }} />
          </View>
        </IntegrationsProvider>
      </VibesProvider>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
