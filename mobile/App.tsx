import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { demoAccount } from './src/demo/data';
import { resetSampleVibes, sampleVibesApi } from './src/demo/sampleVibes';
import { useDemoWorkspace } from './src/demo/useDemoWorkspace';
import { IntegrationsProvider } from './src/integrations/IntegrationsProvider';
import { useWorkspace } from './src/state/useWorkspace';
import { RuntimeBridge } from './src/transport/RuntimeBridge';
import { WorkspaceApp } from './src/ui/WorkspaceApp';
import { AppErrorBoundary } from './src/ui/AppErrorBoundary';
import { LaunchIntro, LaunchPreview } from './src/ui/LaunchIntro';
import { purchaseBridge } from './src/vibes/purchaseBridge';
import { VibesProvider } from './src/vibes/VibesProvider';
import type { Account } from './src/ui/types';
import { MobileAnalyticsProvider } from './src/analytics/mobileAnalytics';
import { PrivacyChoice } from './src/analytics/PrivacyChoice';
import { useMobileEngagement } from './src/analytics/useMobileEngagement';

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }

function AppContent() {
  const runtime = useWorkspace();
  const [analyticsReadyRevision, setAnalyticsReadyRevision] = useState(0);
  const analyticsReady = analyticsReadyRevision > 0;
  const [introVisible, setIntroVisible] = useState(Platform.OS === 'ios');
  const [previewVisible, setPreviewVisible] = useState(false);
  // The sample workspace opens signed out from Settings, or signed in to the demo account from the test button.
  const [demo, setDemo] = useState<{ account: Account | null } | null>(() => Platform.OS === 'web' &&
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1' ? { account: null } : null);
  const sample = useDemoWorkspace({ account: demo?.account ?? null, themePreference: runtime.workspace.themePreference,
    setTheme: runtime.workspace.actions.setTheme, accent: runtime.workspace.accent,
    setAccent: runtime.workspace.actions.setAccent, exitDemo: () => { resetSampleVibes(); setDemo(null); } });
  const openSample = (account: Account | null) => { runtime.workspace.actions.disconnect(); setDemo({ account }); };
  const workspace = demo ? sample : { ...runtime.workspace, actions: { ...runtime.workspace.actions,
    enterDemo: () => openSample(null), signInDemo: () => openSample(demoAccount) } };
  const consent = useSyncExternalStore(runtime.analytics.subscribe, runtime.analytics.snapshot, runtime.analytics.snapshot);
  const scope = runtime.workspace.account?.email ?? 'guest';
  const analyticsEnabled = !demo && analyticsReady && workspace.onboarding.status === 'complete' && !introVisible;
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  useEffect(() => {
    if (analyticsReady && !demo && workspace.onboarding.status === 'complete') void runtime.analytics.refresh(scope);
  }, [analyticsReady, analyticsReadyRevision, demo, workspace.onboarding.status, scope, runtime.analytics, runtime.analyticsSessionRevision]);
  useEffect(() => {
    if (!analyticsReady || demo || consent.choice !== 'declined') return;
    const listener = AppState.addEventListener('change', status => {
      if (status === 'active') void runtime.analytics.refresh(scope);
    });
    return () => listener.remove();
  }, [analyticsReady, demo, consent.choice, runtime.analytics, scope]);
  const activity = useMobileEngagement(runtime.analytics, Boolean(analyticsEnabled), consent.choice,
    scope, platform, Constants.expoConfig?.version);
  return <SafeAreaProvider><MobileAnalyticsProvider value={demo ? null : runtime.analytics}>
    <RuntimeBridge ref={runtime.bridge} onMessage={runtime.onMessage} />
    {/* The sample workspace has the phone's own chat too, answered in `sampleVibes`
        rather than by a server. A test account that lost the chat, or found it
        switched off, read as a broken app rather than as a sample. Purchases are the
        one thing it does not carry: a sample shows a plan, it never sells one. */}
    <VibesProvider api={demo ? sampleVibesApi : runtime.vibesApi}
      identity={demo ? demoAccount.email : workspace.account?.email ?? null}
      purchases={demo ? null : purchaseBridge}
      onMembershipChange={demo ? undefined : runtime.refreshMembership}
      onReady={demo ? undefined : () => setAnalyticsReadyRevision(value => value + 1)}
      guest={!demo && Platform.OS !== 'web' && workspace.onboarding.status === 'complete'}>
      {/* Integrations use the real server and the real account even inside the
          sample workspace: connections belong to the account or guest session, and connecting
          one should not depend on which workspace happens to be on screen. */}
      <IntegrationsProvider api={runtime.integrationsApi} identity={runtime.workspace.account?.email ?? null}>
        <View style={{ flex: 1 }} onStartShouldSetResponderCapture={activity}>
          <View style={{ flex: 1 }} accessibilityElementsHidden={introVisible || previewVisible}
            importantForAccessibility={introVisible || previewVisible ? 'no-hide-descendants' : 'auto'}>
            <WorkspaceApp agentsApi={runtime.agentsApi} agentChatApi={runtime.vibesApi} workspace={workspace} accountWorkspace={runtime.workspace}
              vibesEnabled={Platform.OS === 'ios' || process.env.EXPO_PUBLIC_VIBES_WEB_PREVIEW === '1'}
              onPlayLaunchVideo={() => setPreviewVisible(true)} />
          </View>
          {introVisible && <LaunchIntro ready={workspace.onboarding.status !== 'unknown'}
            onFinish={() => setIntroVisible(false)} />}
          {previewVisible && <LaunchPreview onClose={() => setPreviewVisible(false)} />}
        </View>
      </IntegrationsProvider>
    </VibesProvider>
    <PrivacyChoice visible={Boolean(analyticsEnabled && consent.ready && consent.choice === 'unknown')}
      signedIn={Boolean(runtime.workspace.account)} analytics={runtime.analytics} consent={consent} />
  </MobileAnalyticsProvider></SafeAreaProvider>;
}
