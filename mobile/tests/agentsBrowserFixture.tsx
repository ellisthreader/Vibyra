import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { demoAccount } from '../src/demo/data';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import { agentsApi, chatApi } from './agentsFixtureApi';
import type { WorkspaceModel } from '../src/ui/types';
const query = new URLSearchParams(location.search);
const integrationApi = { catalogue: async () => ({ enabled: true, integrations: fallbackIntegrations.map(a => ({ ...a, installed: a.id === 'github' })) }),
  connect: async () => { throw new Error('No live services in this fixture'); }, disconnect: async () => { throw new Error('No live services in this fixture'); } };
function Fixture() {
  const [signedIn, setSignedIn] = useState(!query.has('signed-out')); const [connected, setConnected] = useState(false);
  Object.assign(window, { switchAgentAccount: () => setSignedIn(false), reconnectAgentHost: () => setConnected(v => !v) });
  const workspace: WorkspaceModel = { ...fixtureWorkspace, demo: query.has('demo'), status: connected ? 'connected' : 'disconnected', account: signedIn ? demoAccount : null,
    host: connected ? fixtureWorkspace.host : null, selectedSessionId: null, sessions: [], themePreference: query.get('theme') === 'light' ? 'light' : 'dark' };
  return <SafeAreaProvider><View style={{ flex: 1 }}>
    <Text style={{ textAlign: 'center', fontSize: 11, backgroundColor: '#ddd' }}>Teammate UI fixture · no live tasks</Text>
    <VibesProvider api={chatApi} identity={workspace.account?.email ?? null} purchases={null}>
      <IntegrationsProvider api={integrationApi} identity={workspace.account?.email ?? null}>
        <WorkspaceApp workspace={workspace} accountWorkspace={query.has('demo') ? { ...workspace, demo: false, account: null } : workspace}
          agentsApi={agentsApi} agentChatApi={chatApi} vibesEnabled={!query.has('phone-chat-off')} />
      </IntegrationsProvider>
    </VibesProvider>
  </View></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
