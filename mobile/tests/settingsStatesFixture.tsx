import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { demoAccount } from '../src/demo/data';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import type { IntegrationsApi } from '../src/integrations/types';
import { SettingsSheet } from '../src/settings/SettingsSheet';
import { paletteFor, ThemeContext, type AccentId } from '../src/theme';
import { DrawerActions } from '../src/ui/DrawerActions';
import type { ThemePreference } from '../src/ui/types';
import { VibesProvider } from '../src/vibes/VibesProvider';

// Settings over the real sample workspace (`useDemoWorkspace`, as App.tsx builds it):
// `?who=test` is the development Test button's account, `?who=sample` a sample opened
// signed out. Row actions land on `window.statesCalls`; any request the page makes to
// a server lands on `window.statesNetwork`, which must stay empty.
const query = new URLSearchParams(location.search);
const who = query.get('who') ?? 'test';
const calls: string[] = [];
const network: string[] = [];
Object.assign(window, { statesCalls: calls, statesNetwork: network });
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!/^(blob|data):/.test(url)) network.push(url);
  return realFetch(input, init);
}) as typeof fetch;
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const catalogue = { enabled: true, integrations: fallbackIntegrations.map(item => ({ ...item, installed: false })) };
const integrations: IntegrationsApi = { catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue };
const record = (name: string) => () => { calls.push(name); };

function Fixture() {
  const [theme, setTheme] = useState<ThemePreference>(query.get('theme') === 'light' ? 'light' : 'dark');
  const [accent, setAccent] = useState<AccentId>('cobalt');
  const [visible, setVisible] = useState(true);
  const workspace = useDemoWorkspace({ account: who === 'test' ? demoAccount : null, themePreference: theme, setTheme,
    accent, setAccent, exitDemo: record('exitDemo') });
  const dark = theme !== 'light';
  const colors = paletteFor(dark, accent);
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider><SafeAreaInsetsContext.Provider value={insets}>
      <VibesProvider api={sampleVibesApi} identity={demoAccount.email} purchases={null}>
        <IntegrationsProvider api={integrations} identity={null}>
          <View style={{ flex: 1, backgroundColor: colors.rail, paddingTop: insets.top }}>
            <View aria-hidden={visible} accessibilityElementsHidden={visible} style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '600', padding: 20 }}>Vibyra</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => setVisible(true)}
                style={{ margin: 20, minHeight: 44, borderRadius: 14, backgroundColor: colors.action }} />
              {/* The rail's own Settings button, so the photo it shows can be checked too. */}
              <DrawerActions bottom={20} account={workspace.account} onChat={record('chat')} onSettings={() => setVisible(true)} />
            </View>
            <SettingsSheet visible={visible} workspace={workspace} onClose={() => { calls.push('close'); setVisible(false); }}
              routes={{ plugins: record('plugins'), wallet: record('wallet'), remote: record('remote'), connect: record('connect') }} />
          </View>
        </IntegrationsProvider>
      </VibesProvider>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
