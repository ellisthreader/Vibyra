import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { demoAccount } from '../src/demo/data';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import { agentsApi, chatApi } from './agentsFixtureApi';
import type { WorkspaceModel } from '../src/ui/types';

// The real WorkspaceApp, stepped from the welcome flow into the home screen the
// way a new account arrives, so the tour's own trigger is what opens it.
const query = new URLSearchParams(location.search);
const integrationApi = { catalogue: async () => ({ enabled: true, integrations: fallbackIntegrations.map(a => ({ ...a, installed: false })) }),
  connect: async () => { throw new Error('No live services in this fixture'); }, disconnect: async () => { throw new Error('No live services in this fixture'); } };
function Fixture() {
  const [status, setStatus] = useState<'pending' | 'complete'>(query.has('returning') ? 'complete' : 'pending');
  const connected = query.has('connected');
  const workspace: WorkspaceModel = { ...fixtureWorkspace, demo: false, status: connected ? 'connected' : 'offline',
    account: { ...demoAccount, name: 'Ada Lovelace' }, host: connected ? { ...fixtureWorkspace.host!, name: 'Studio Mac' } : null,
    selectedSessionId: null, sessions: [], themePreference: query.get('theme') === 'light' ? 'light' : 'dark',
    onboarding: { status, mode: null },
    actions: { ...fixtureWorkspace.actions, completeOnboarding: async () => setStatus('complete') } };
  return <SafeAreaProvider><View style={{ flex: 1 }}>
    <VibesProvider api={chatApi} identity={workspace.account?.email ?? null} purchases={null}>
      <IntegrationsProvider api={integrationApi} identity={workspace.account?.email ?? null}>
        <WorkspaceApp workspace={workspace} accountWorkspace={workspace}
          agentsApi={query.has('noAgents') ? undefined : agentsApi}
          agentChatApi={query.has('noAgents') ? undefined : chatApi} vibesEnabled />
      </IntegrationsProvider>
    </VibesProvider>
  </View></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
