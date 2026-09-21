import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import type { IntegrationsApi } from '../src/integrations/types';
import { SettingsSheet } from '../src/settings/SettingsSheet';
import { isAccentId, paletteFor, ThemeContext, type AccentId } from '../src/theme';
import type { ThemePreference, WorkspaceModel } from '../src/ui/types';

// The Settings sheet over a stand-in app, with a made-up account in one of three
// states: `?state=signedin` (an account and a connected computer), `signedout` (no
// account, no computer) or `sample` (the sample workspace). `?theme=` and `?accent=`
// set the starting look; everything a row does is recorded on `window.settingsCalls`.
const calls: string[] = [];
(window as unknown as { settingsCalls: string[] }).settingsCalls = calls;
window.open = ((url?: string | URL) => { calls.push(`open ${String(url)}`); return null; }) as typeof window.open;
const query = new URLSearchParams(location.search);
const state = query.get('state') ?? 'signedin';
const insets = { top: Number(query.get('top') ?? 47), bottom: Number(query.get('bottom') ?? 34), left: 0, right: 0 };
const catalogue = { enabled: true, integrations: fallbackIntegrations.map((item, index) => ({ ...item, installed: index < 2 })) };
const integrations: IntegrationsApi = { catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue };
const record = (name: string) => () => { calls.push(name); };
// A Pro wallet, so Vibyra tokens reads "Pro 20× · 1,240" (Pro's size is its name).
const vibesApi = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, plan: 'pro', available: 1240, total: 1240 }) };

function Fixture() {
  const [theme, setTheme] = useState<ThemePreference>(query.get('theme') === 'light' ? 'light' : 'dark');
  const [accent, setAccent] = useState<AccentId>(isAccentId(query.get('accent')) ? query.get('accent') as AccentId : 'cobalt');
  const [size, setSize] = useState(13);
  const [visible, setVisible] = useState(query.get('open') !== '0');
  const dark = theme !== 'light';
  const colors = paletteFor(dark, accent);
  const workspace = useMemo<WorkspaceModel>(() => {
    const signedIn = state === 'signedin';
    const sample = state === 'sample';
    const host = signedIn ? { id: 'mac', name: 'MacBook Pro', platform: 'macOS' } : sample ? { id: 'demo', name: 'Studio Mac', platform: 'macOS' } : null;
    return {
      demo: sample, status: host ? 'connected' : 'offline', error: null, host, projects: [], sessions: [], devices: [], approvals: [],
      selectedSessionId: null, output: '', themePreference: theme, accent, terminalFontSize: size,
      onboarding: { status: 'complete', mode: null },
      account: signedIn ? { email: 'ellis@example.com', name: 'Ellis', plan: 'pro' } : null,
      actions: {
        connect: async () => {}, disconnect: () => {}, refresh: async () => {}, selectSession: () => {}, createSession: async () => {},
        sendInput: async () => {}, resize: () => {}, stopSession: async () => {}, listFiles: async () => ({ entries: [] }),
        readFile: async () => ({ path: '', content: '', truncated: false }), getDiff: async () => ({ diff: '', truncated: false }),
        setTheme: value => { calls.push(`theme ${value}`); setTheme(value); },
        setAccent: value => { calls.push(`accent ${value}`); setAccent(value); },
        setTerminalFontSize: value => { calls.push(`size ${value}`); setSize(value); },
        logIn: async () => {}, signUp: async () => {},
        logOut: signedIn ? async () => { calls.push('logOut'); } : undefined,
        resetOnboarding: sample ? undefined : async () => { calls.push('resetOnboarding'); },
        enterDemo: sample ? undefined : record('enterDemo'), exitDemo: sample ? record('exitDemo') : undefined,
      },
    };
  }, [theme, accent, size]);
  const close = () => { calls.push('close'); setVisible(false); };
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider><SafeAreaInsetsContext.Provider value={insets}>
      <VibesProvider api={vibesApi} identity={state === 'signedin' ? 'ellis@example.com' : null} purchases={null}>
      <IntegrationsProvider api={integrations} identity="ellis@example.com">
        <View testID="fixture-ground" style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <View aria-hidden={visible} accessibilityElementsHidden={visible} importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}
            style={{ padding: 20, gap: 16 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '600', textAlign: 'center' }}>Vibyra</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => setVisible(true)}
              style={{ minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action }}>
              <Text testID="fixture-action-text" style={{ color: colors.onAction, fontWeight: '600' }}>Open settings</Text>
            </Pressable>
          </View>
          <SettingsSheet visible={visible} workspace={workspace} onClose={close}
            routes={{ plugins: record('plugins'), wallet: record('wallet'), remote: record('remote'), connect: record('connect') }} />
        </View>
      </IntegrationsProvider>
      </VibesProvider>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
