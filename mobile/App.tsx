import { useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { demoAccount } from './src/demo/data';
import { resetSampleVibes, sampleVibesApi } from './src/demo/sampleVibes';
import { useDemoWorkspace } from './src/demo/useDemoWorkspace';
import { IntegrationsProvider } from './src/integrations/IntegrationsProvider';
import { useWorkspace } from './src/state/useWorkspace';
import { RuntimeBridge } from './src/transport/RuntimeBridge';
import { WorkspaceApp } from './src/ui/WorkspaceApp';
import { AppErrorBoundary } from './src/ui/AppErrorBoundary';
import { purchaseBridge } from './src/vibes/purchaseBridge';
import { VibesProvider } from './src/vibes/VibesProvider';
import type { Account } from './src/ui/types';

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }

function AppContent() {
  const runtime = useWorkspace();
  // The sample workspace opens signed out from Settings, or signed in to the demo account from the test button.
  const [demo, setDemo] = useState<{ account: Account | null } | null>(() => Platform.OS === 'web' &&
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1' ? { account: null } : null);
  const sample = useDemoWorkspace({ account: demo?.account ?? null, themePreference: runtime.workspace.themePreference,
    setTheme: runtime.workspace.actions.setTheme, accent: runtime.workspace.accent,
    setAccent: runtime.workspace.actions.setAccent, exitDemo: () => { resetSampleVibes(); setDemo(null); } });
  const openSample = (account: Account | null) => { runtime.workspace.actions.disconnect(); setDemo({ account }); };
  const workspace = demo ? sample : { ...runtime.workspace, actions: { ...runtime.workspace.actions,
    enterDemo: () => openSample(null), signInDemo: () => openSample(demoAccount) } };
  return <SafeAreaProvider>
    <RuntimeBridge ref={runtime.bridge} onMessage={runtime.onMessage} />
    {/* The sample workspace has the phone's own chat too, answered in `sampleVibes`
        rather than by a server. A test account that lost the chat, or found it
        switched off, read as a broken app rather than as a sample. Purchases are the
        one thing it does not carry: a sample shows a plan, it never sells one. */}
    <VibesProvider api={demo ? sampleVibesApi : runtime.vibesApi}
      identity={demo ? demoAccount.email : workspace.account?.email ?? null}
      purchases={demo ? null : purchaseBridge}
      onMembershipChange={demo ? undefined : runtime.refreshMembership}
      guest={!demo && Platform.OS === 'ios' && workspace.onboarding.status === 'complete'}>
      {/* Integrations use the real server and the real account even inside the
          sample workspace: connections belong to the account or guest session, and connecting
          one should not depend on which workspace happens to be on screen. */}
      <IntegrationsProvider api={runtime.integrationsApi} identity={runtime.workspace.account?.email ?? null}>
        <WorkspaceApp agentsApi={runtime.agentsApi} agentChatApi={runtime.vibesApi} workspace={workspace} accountWorkspace={runtime.workspace}
          vibesEnabled={Platform.OS === 'ios' || process.env.EXPO_PUBLIC_VIBES_WEB_PREVIEW === '1'} />
      </IntegrationsProvider>
    </VibesProvider>
  </SafeAreaProvider>;
}
