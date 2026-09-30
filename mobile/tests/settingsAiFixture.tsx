import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { createSamplePreferences } from '../src/demo/samplePreferences';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import type { IntegrationsApi } from '../src/integrations/types';
import type { SettingsPageId } from '../src/settings/pages';
import { SettingsSheet } from '../src/settings/SettingsSheet';
import { paletteFor, ThemeContext } from '../src/theme';
import type { ThemePreference, WorkspaceModel } from '../src/ui/types';
import { createPreferencesApi } from '../src/vibes/preferencesApi';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { preferencesServer, type ServerMode } from './preferencesServer';

// Settings > Personality and Memory against the backend's routes held in memory
// (tests/preferencesServer.ts), so the real client, store and pages all run.
// `?page=home|personality|memory`, `?server=ready|missing|offline`, `?who=account|guest|nobody|sample`,
// `?full=1` (50 memories), `?delay=ms`, `?theme=light|dark`. The server is `window.aiServer`.
const query = new URLSearchParams(location.search);
const who = query.get('who') ?? 'account';
const full = query.get('full') === '1';
const server = preferencesServer({ mode: (query.get('server') ?? 'ready') as ServerMode, delay: Number(query.get('delay') ?? 0),
  ...(full ? { memories: Array.from({ length: 50 }, (_, index) => `Remembered thing number ${index + 1}.`) } : {}) });
(window as unknown as { aiServer: typeof server }).aiServer = server;
const live = createPreferencesApi('https://vibyra.test', () => (who === 'account' || who === 'guest' ? 'token' : null), server.fetch);
// The sample workspace brings its own in-memory client, exactly as the app's demo does.
const preferences = who === 'sample' ? createSamplePreferences() : live;
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const catalogue = { enabled: true, integrations: fallbackIntegrations.map((item, index) => ({ ...item, installed: index < 2 })) };
const integrations: IntegrationsApi = { catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue };
const noop = () => {};

function Fixture() {
  const [theme] = useState<ThemePreference>(query.get('theme') === 'light' ? 'light' : 'dark');
  const [visible, setVisible] = useState(true);
  const dark = theme !== 'light';
  const colors = paletteFor(dark, 'cobalt');
  const workspace = useMemo<WorkspaceModel>(() => ({
    demo: who === 'sample', status: 'offline', error: null, host: null, projects: [], sessions: [], devices: [], approvals: [],
    selectedSessionId: null, output: '', themePreference: theme, accent: 'cobalt', onboarding: { status: 'complete', mode: null },
    account: who === 'account' || who === 'sample' ? { email: 'ellis@example.com', name: 'Ellis', plan: 'pro' } : null,
    preferences,
    actions: {
      connect: async () => {}, disconnect: noop, refresh: async () => {}, selectSession: noop, createSession: async () => {},
      sendInput: async () => {}, resize: noop, stopSession: async () => {}, listFiles: async () => ({ entries: [] }),
      readFile: async () => ({ path: '', content: '', truncated: false }), getDiff: async () => ({ diff: '', truncated: false }),
      setTheme: noop, setAccent: noop, logIn: async () => null, signUp: async () => {},
    },
  }), [theme]);
  const page = query.get('page');
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider><SafeAreaInsetsContext.Provider value={insets}>
      <VibesProvider api={sampleVibesApi} identity={null} purchases={null}>
        <IntegrationsProvider api={integrations} identity="ellis@example.com">
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <SettingsSheet visible={visible} workspace={workspace} onClose={() => setVisible(false)}
              initialPage={page && page !== 'home' ? page as SettingsPageId : null}
              routes={{ plugins: noop, wallet: noop, remote: noop, connect: noop }} />
          </View>
        </IntegrationsProvider>
      </VibesProvider>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
