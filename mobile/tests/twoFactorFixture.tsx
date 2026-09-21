import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { createAccountApi } from '../src/account/accountApi';
import { restoreAccount } from '../src/account/accountActions';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import type { IntegrationsApi } from '../src/integrations/types';
import { AccountForm } from '../src/onboarding/AccountForm';
import type { SettingsPageId } from '../src/settings/pages';
import { SettingsSheet } from '../src/settings/SettingsSheet';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { paletteFor, ThemeContext } from '../src/theme';
import { RpcClient } from '../src/transport/RpcClient';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { twoFactorServer } from './twoFactorServer';

// Settings > Security > Two-factor, and the login it then gates, over a real
// WorkspaceStore whose account API talks to a pretend server that does the same TOTP
// arithmetic a real authenticator app does. `?page=`, `?on=1` for an account that
// already has it, `?signedOut=1` for the login form, `?theme=light`.
const query = new URLSearchParams(location.search);
const calls: string[] = [];
const server = twoFactorServer({ email: 'ellis@example.com', enabled: query.get('on') === '1', log: calls });
Object.assign(window, { accountCalls: calls, twoFactor: server.state });
const api = createAccountApi({ baseUrl: 'https://api.example.test', deviceName: 'Vibyra web', fetch: server.fetch as typeof fetch });
const memory = new Map<string, string>();
const storage = { read: async (key: string) => memory.get(key) ?? null,
  write: async (key: string, value: string) => { memory.set(key, value); }, delete: async (key: string) => { memory.delete(key); } };
const store = new WorkspaceStore({ rpc: new RpcClient(() => {}, () => crypto.randomUUID()), storage, flags: storage,
  uuid: () => crypto.randomUUID(), account: api });
const signedOut = query.get('signedOut') === '1';
if (!signedOut) void restoreAccount(store, JSON.stringify({ token: 'tok', email: 'ellis@example.com', name: 'Ellis',
  plan: 'pro', provider: query.get('provider') ?? 'email', emailVerified: true, twoFactorEnabled: query.get('on') === '1' }));
store.update({ onboarding: { status: 'complete', mode: null } });
const catalogue = { enabled: true, integrations: fallbackIntegrations.map((item, index) => ({ ...item, installed: index < 2 })) };
const integrations: IntegrationsApi = { catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue };
const vibesApi = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, plan: 'pro', available: 1240, total: 1240 }) };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const noop = () => { calls.push('route'); };

function Fixture() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [visible, setVisible] = useState(!signedOut);
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
            {signedOut ? <View style={{ padding: 20 }}>
              <AccountForm workspace={workspace} mode="login" onMode={() => {}} onDone={() => calls.push('done')} />
            </View> : <SettingsSheet visible={visible} workspace={workspace} onClose={() => setVisible(false)}
              initialPage={query.get('page') as SettingsPageId | null}
              routes={{ plugins: noop, wallet: noop, remote: noop, connect: noop }} />}
          </View>
        </IntegrationsProvider>
      </VibesProvider>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
