import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider, useIntegrations } from '../src/integrations/IntegrationsProvider';
import { deviceIntegrations } from '../src/integrations/deviceIntegrations';
import type { DeviceWorkspace } from '../src/integrations/deviceIntegrations';
import type { VaultChat } from '../src/integrations/DeviceIntegrationSheet';
import type { IntegrationCatalogue, IntegrationsApi } from '../src/integrations/types';
import { palettes, ThemeContext } from '../src/theme';
import { AppHeader } from '../src/ui/AppHeader';
import { IntegrationsScreen } from '../src/ui/IntegrationsScreen';
import { VibesComposer } from '../src/vibes/VibesComposer';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// Disconnecting asks first (a native alert; `window.confirm` on the web). Playwright
// dismisses dialogs it is not told about, which would answer "keep it", so the
// fixture answers yes: the scripts prove the disconnect, not the question.
window.confirm = () => true;

// Every call the page makes lands here, so a test can prove that browsing and
// reading an integration's page never connects anything - only tapping Connect does.
const calls: string[] = [];
(window as unknown as { integrationCalls: string[] }).integrationCalls = calls;
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const state = query.get('state') ?? 'browse';
const startsSignedOut = state === 'signedout' || state === 'legacy' || state === 'oauth-signedout';

// Every integration we ship can change something, so `readonly` is what proves the
// other half of the page: with `writes` cleared, the "what it can change" section
// has to disappear rather than print a heading over nothing. A synthetic entry
// rather than a real one, because pretending a service only reads would be a lie
// the day someone reads this fixture for the truth.
const shape = (installed: string[]): IntegrationCatalogue => ({
  enabled: true,
  integrations: fallbackIntegrations.map(integration => ({
    ...integration,
    credential: { ...integration.credential, configured: state !== 'unconfigured',
      ...(state === 'legacy' ? { kind: 'token' as const, label: 'Personal access token', placeholder: 'github_pat_…' } : {}) },
    ...(state === 'readonly' ? { writes: null } : {}),
    ...(installed.includes(integration.id)
      ? { installed: true, account: '@ellis', connectedAt: '2026-09-09T00:00:00Z' } : {}),
  })),
});
let connected = state === 'composer' ? ['github', 'stripe', 'figma'] : state === 'installed' ? ['github'] : [];
const api: IntegrationsApi = {
  catalogue: async () => {
    calls.push('catalogue');
    if (state === 'offline') throw new Error('Could not reach Vibyra. Check your connection and try again.');
    return shape(connected);
  },
  connect: async () => { throw new Error('The mobile UI must never request a pasted key.'); },
  disconnect: async id => { calls.push('disconnect:' + id); connected = connected.filter(item => item !== id); return shape(connected); },
  // The native fixture separately verifies the real system browser handoff.
  authorize: async id => {
    calls.push('authorize:' + id);
    if (state === 'failure' && id === 'github') throw new Error('GitHub could not be reached. Please try again.');
    if (state === 'oauth-cancel') throw new Error('You cancelled the sign-in.');
    connected = [...connected, id];
    return { catalogue: shape(connected) };
  },
};

// Obsidian and Railway are not accounts on the server: they are built from what the
// paired Mac reports, so here the fixture plays the Mac. Nothing about them goes
// through the api above, which is the point - a test can prove that opening either
// card asks the server for nothing.
const host = { id: 'fixture-host', name: 'Fixture Mac', platform: 'macos' };
const pocket = { id: 'fixture-project', name: 'Pocket', path: '/projects/pocket', branch: 'main' };
const notes = { id: 'vault', name: 'Notes', path: '/Users/ellis/Notes', kind: 'vault' as const, filesAvailable: true };
// What the Mac says the second time it is asked: the folder has since been chosen and
// the CLI signed in. It is what "Check again" is for, and the only way to prove that a
// row and the card open over it turn connected together.
const answered: DeviceWorkspace = { status: 'connected', host, projects: [pocket, notes, { id: 'railway', name: 'Railway', path: '/virtual', kind: 'railway', filesAvailable: true }],
  railway: { status: 'ready', account: 'ellis@example.com' } };
const macStates: Record<string, DeviceWorkspace> = {
  vault: { status: 'connected', host, projects: [pocket, notes], railway: { status: 'signedOut', account: null } },
  novault: { status: 'connected', host, projects: [pocket], railway: { status: 'missing', account: null } },
  nocomputer: { status: 'offline', host: null, projects: [], railway: null },
};
const vaultChat: VaultChat = { block: null, busy: false, error: null,
  start: async project => { calls.push('vault-chat:' + project.id); } };

// The composer on its own, with one integration connected. What is under test is the
// `@` affordance, not the chat around it, so nothing here can send a turn.
function Composer() {
  const { installed } = useIntegrations();
  const [text, setText] = useState('');
  return <View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <VibesComposer input={{ text, onChange: setText, mentions: [...installed, ...deviceIntegrations(answered)] }}
      model={{ label: 'Auto', onOpen: () => {} }}
      attachments={{ items: [], onAdd: () => {}, onRemove: () => {} }}
      submission={{ busy: false, disabled: true, onSend: () => {}, onStop: () => {} }} />
  </View>;
}
function Fixture() {
  const colors = dark ? palettes.dark : palettes.light;
  const identity = startsSignedOut ? null : 'ellis@example.com';
  const [mac, setMac] = useState(macStates[state]);
  const computer = mac ? { ...mac, actions: { refresh: async () => {
    calls.push('ask-computer');
    // Only the state that is about a Mac catching up answers differently.
    if (state === 'novault') setMac(answered);
  } } } : undefined;
  // The canvas and the header both belong to `WorkspaceApp` in the real app, and
  // a screen that drew its own would double-paint. Without them here the page
  // renders on browser white with nothing naming it, which is not what ships:
  // "Integrations" is the header's job now, so the fixture has to carry the header.
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <IntegrationsProvider api={api} identity={identity}>
          {state === 'composer' ? <Composer /> : <>
            <AppHeader destination="integrations" workspace={fixtureWorkspace} session={undefined} connected
              compact={false} onMenu={() => {}} onNewChat={() => {}} onSwitchChat={() => {}} onComputers={() => {}} />
            <IntegrationsScreen onUse={mention => calls.push('use:' + mention)} signedIn={identity !== null}
              workspace={computer} vault={computer && vaultChat} onConnectComputer={computer && (() => calls.push('connect-computer'))} />
          </>}
        </IntegrationsProvider>
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
