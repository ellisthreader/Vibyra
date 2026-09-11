import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { Button } from '../src/ui/primitives';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider, useIntegrations } from '../src/integrations/IntegrationsProvider';
import type { IntegrationCatalogue, IntegrationsApi } from '../src/integrations/types';
import { palettes, ThemeContext } from '../src/theme';
import { AppHeader } from '../src/ui/AppHeader';
import { IntegrationsScreen } from '../src/ui/IntegrationsScreen';
import { VibesComposer } from '../src/vibes/VibesComposer';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// Every call the page makes lands here, so a test can prove that browsing and
// reading an integration's page never connects anything - only tapping Connect does.
const calls: string[] = [];
(window as unknown as { integrationCalls: string[] }).integrationCalls = calls;
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const state = query.get('state') ?? 'browse';
const startsSignedOut = state === 'signedout' || state === 'oauth-signedout' || state === 'oauth-taken';

// Every integration we ship can change something, so `readonly` is what proves the
// other half of the page: with `writes` cleared, the "what it can change" section
// has to disappear rather than print a heading over nothing. A synthetic entry
// rather than a real one, because pretending a service only reads would be a lie
// the day someone reads this fixture for the truth.
const shape = (installed: string[]): IntegrationCatalogue => ({
  enabled: true,
  integrations: fallbackIntegrations.map(integration => ({
    ...integration,
    // `oauth…` states are servers that can send a person to the provider's sign-in;
    // in the signed-out ones GitHub's sign-in makes the Vibyra account too, as it does live.
    ...(state.startsWith('oauth') ? { credential: { ...integration.credential, kind: 'oauth' as const,
      signsIn: integration.id === 'github' && startsSignedOut } } : {}),
    ...(state === 'readonly' ? { writes: null } : {}),
    ...(installed.includes(integration.id)
      ? { installed: true, account: '@ellis', connectedAt: '2026-09-09T00:00:00Z' } : {}),
  })),
});
let connected = state === 'installed' || state === 'composer' ? ['github'] : [];
const api: IntegrationsApi = {
  catalogue: async () => {
    calls.push('catalogue');
    if (state === 'offline') throw new Error('Could not reach Vibyra. Check your connection and try again.');
    return shape(connected);
  },
  connect: async (id, credential) => {
    calls.push('connect:' + id);
    if (!credential.startsWith('github_pat_')) throw new Error('That token did not work. Check it has not expired and try again.');
    connected = [...connected, id]; return shape(connected);
  },
  disconnect: async id => { calls.push('disconnect:' + id); connected = connected.filter(item => item !== id); return shape(connected); },
  // Stands in for the system browser sheet, which a test cannot drive: approving connects, cancelling says so.
  // Begun signed out, GitHub's identity signs the person in, and the phone is handed that session;
  // `oauth-taken` is a GitHub email that already has a Vibyra account, which is refused, not joined.
  authorize: async id => {
    calls.push('authorize:' + id);
    if (state === 'oauth-cancel') throw new Error('You cancelled the sign-in.');
    if (state === 'oauth-taken') throw new Error('An account already exists for that email. Log in with its original method.');
    connected = [...connected, id];
    return { catalogue: shape(connected), ...(state === 'oauth-signedout'
      ? { session: { token: 'fixture-token', user: { email: 'octo@example.com', name: 'Octo', plan: 'free' } } } : {}) };
  },
};

// The composer on its own, with one integration connected. What is under test is the
// `@` affordance, not the chat around it, so nothing here can send a turn.
function Composer() {
  const { installed } = useIntegrations();
  const [text, setText] = useState('');
  return <View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <VibesComposer text={text} onChange={setText} model="Auto" onModel={() => {}} mentions={installed}
      busy={false} disabled onSend={() => {}} onStop={() => {}} />
  </View>;
}
function Fixture() {
  const colors = dark ? palettes.dark : palettes.light;
  const [identity, setIdentity] = useState<string | null>(startsSignedOut ? null : 'ellis@example.com');
  // The canvas and the header both belong to `WorkspaceApp` in the real app, and
  // a screen that drew its own would double-paint. Without them here the page
  // renders on browser white with nothing naming it, which is not what ships:
  // "Integrations" is the header's job now, so the fixture has to carry the header.
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <IntegrationsProvider api={api} identity={identity}
          onSession={async session => { calls.push('session:' + session.user.email); setIdentity(session.user.email); }}>
          {state === 'composer' ? <Composer /> : <>
            <AppHeader destination="integrations" workspace={fixtureWorkspace} session={undefined} connected
              compact={false} onMenu={() => {}} onNewChat={() => {}} onSwitchChat={() => {}} onComputers={() => {}} />
            <IntegrationsScreen onUse={mention => calls.push('use:' + mention)} signedIn={identity !== null}
              signIn={done => <View><Text style={{ color: colors.text }}>Fixture sign-in form</Text>
                <Button title="Finish sign-in" onPress={() => { calls.push('signed-in'); setIdentity('ellis@example.com'); done(); }} /></View>} />
          </>}
        </IntegrationsProvider>
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
