import { useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { demoAccount } from './src/demo/data';
import { sampleVibesApi } from './src/demo/sampleVibes';
import { useDemoWorkspace } from './src/demo/useDemoWorkspace';
import { IntegrationsProvider } from './src/integrations/IntegrationsProvider';
import { useWorkspace } from './src/state/useWorkspace';
import { RuntimeBridge } from './src/transport/RuntimeBridge';
import { WorkspaceApp } from './src/ui/WorkspaceApp';
import { VibesProvider } from './src/vibes/VibesProvider';
import type { Account } from './src/ui/types';

export default function App() {
  const runtime = useWorkspace();
  // The sample workspace opens signed out from Settings, or signed in to the demo account from the test button.
  const [demo, setDemo] = useState<{ account: Account | null } | null>(() => Platform.OS === 'web' &&
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1' ? { account: null } : null);
  const sample = useDemoWorkspace({ account: demo?.account ?? null, themePreference: runtime.workspace.themePreference,
    setTheme: runtime.workspace.actions.setTheme, exitDemo: () => setDemo(null) });
  const openSample = (account: Account | null) => { runtime.workspace.actions.disconnect(); setDemo({ account }); };
  const workspace = demo ? sample : { ...runtime.workspace, actions: { ...runtime.workspace.actions,
    enterDemo: () => openSample(null), signInDemo: () => openSample(demoAccount) } };
  return <SafeAreaProvider>
    <RuntimeBridge ref={runtime.bridge} onMessage={runtime.onMessage} />
    <VibesProvider api={demo ? sampleVibesApi : runtime.vibesApi}
      identity={demo ? demoAccount.email : workspace.account?.email ?? null}>
      {/* Integrations use the real server and the real account even inside the
          sample workspace: a key is saved to a Vibyra account, and connecting
          one should not depend on which workspace happens to be on screen. */}
      <IntegrationsProvider api={runtime.integrationsApi} identity={runtime.workspace.account?.email ?? null}
        onSession={runtime.workspace.actions.adoptSession}>
        <WorkspaceApp workspace={workspace} accountWorkspace={runtime.workspace}
          vibesEnabled={!demo && (Platform.OS === 'ios' || process.env.EXPO_PUBLIC_VIBES_WEB_PREVIEW === '1')} />
      </IntegrationsProvider>
    </VibesProvider>
  </SafeAreaProvider>;
}
