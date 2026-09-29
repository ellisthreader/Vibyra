import { useFundedWorkspace } from '../vibes/useFundedWorkspace';
import { useNotificationNavigation } from '../notifications/useNotificationNavigation';
import { useNotificationResponses } from '../notifications/useNotificationResponses';
import { workspacePalette } from './workspacePalette';
import { AgentsScreen } from '../agents/AgentsScreen';
import { ProductModeSwitch, useProductMode } from '../agents/ProductMode';
import type { AgentsApi } from '../agents/types';
import type { VibesApi } from '../vibes/types';
import { useEffect, useMemo, useState } from 'react';
import { createSampleAgents } from '../demo/sampleAgents';
import { demoAccount } from '../demo/data';
import { IntegrationsProvider } from '../integrations/IntegrationsProvider';
import { StatusBar, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { workspaceStyles as s } from './workspaceStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { AppHeader } from './AppHeader';
import { ThemeContext } from '../theme';
import { computerMode } from './mode';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewProjectSheet } from './newProject/NewProjectSheet';
import { IntegrationsScreen } from './IntegrationsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsSheet } from '../settings/SettingsSheet';
import type { SettingsPageId } from '../settings/pages';
import { AccountSheet } from './AccountSheet';
import { WorkScreen } from './WorkScreen';
import { ProjectTerminalLauncher } from './ProjectTerminalLauncher';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesDrawer } from '../vibes/VibesDrawer';
import { WalletScreen } from '../vibes/WalletScreen';
import { useVibesChats, useVibesStore } from '../vibes/VibesProvider';
import { useVaultChat } from '../vibes/useVaultChat';
import { vibesDraftKey } from '../vibes/draftScope';
import { setDraftForScope } from './useDraft';
import { PreviewSessionSheet } from '../preview/PreviewSessionSheet';
import { useLivePreviewTarget } from '../preview/useLivePreviewTarget';
import { chatProjectId, isIdeas } from './ideas';
import { useProjectNavigation } from './useProjectNavigation';
import { projectSession } from './projectSession';
import { useWorkspacePanels } from './useWorkspacePanels';
import type { Destination, WorkspaceModel } from './types';
import { useMobileAnalytics, useMobileScreenAnalytics } from '../analytics/mobileAnalytics';
import { FirstRunTour } from '../tour/FirstRunTour';
export function WorkspaceApp({ workspace: computerWorkspace, accountWorkspace = computerWorkspace, vibesEnabled = false, agentsApi, agentChatApi, onPlayLaunchVideo }: {
  agentsApi?: AgentsApi; agentChatApi?: VibesApi;
  workspace: WorkspaceModel;
  /** The real account, which Integrations uses even while the sample workspace is on screen. */
  accountWorkspace?: WorkspaceModel;
  vibesEnabled?: boolean;
  onPlayLaunchVideo?: () => void;
}) {
  const workspace = useFundedWorkspace(computerWorkspace);
  const sampleAgents = useMemo(() => workspace.demo ? createSampleAgents() : null, [workspace.demo]);
  const agentWorkspace = sampleAgents ? { ...workspace, account: workspace.account ?? demoAccount } : accountWorkspace;
  const [productMode, setProductMode] = useProductMode(sampleAgents ? `sample:${agentWorkspace.account!.email}` : accountWorkspace.account?.email ?? null);
  const agentsAvailable = Boolean(sampleAgents || agentsApi && agentChatApi);
  const agentMode = agentsAvailable && productMode === 'agent';
  const systemScheme = useColorScheme(); const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = workspacePalette(dark, workspace.accent);
  const theme = useMemo(() => ({ colors, dark }), [colors, dark]);
  const connected = computerMode(workspace);
  const vibes = useVibesStore(); const analytics = useMobileAnalytics();
  const { chats, selected } = useVibesChats();
  const nav = useProjectNavigation(workspace, vibes);
  const { destination, setDestination, projectId, drawer, setDrawer } = nav;
  const { connect, setConnect, newProject, setNewProject,
    sessionOptions, setSessionOptions, livePreview, setLivePreview,
    openLivePreview } = useWorkspacePanels(workspace.demo,
    workspace.onboarding.status, workspace.selectedSessionId, projectId);
  useNotificationResponses(workspace.demo ? undefined : accountWorkspace.notifications, accountWorkspace.account?.email ?? null, accountWorkspace.remoteAccess);
  const [settings, setSettings] = useState<{ page?: SettingsPageId } | null>(null);
  const [walletSignIn, setWalletSignIn] = useState(false);
  const [returnTo, setReturnTo] = useState<Destination>('work');
  const [walletFrom, setWalletFrom] = useState<SettingsPageId | null>(null);
  const [settingsLed, setSettingsLed] = useState<Destination | null>(null);
  useEffect(() => { if (settingsLed && settingsLed !== destination) setSettingsLed(null); }, [destination, settingsLed]);
  const openWallet = (from?: SettingsPageId) => { setWalletFrom(from ?? null); setReturnTo(destination); setDrawer(false); setDestination('vibes'); };
  const openSettings = (page?: SettingsPageId) => {
    setDrawer(false);
    if (destination === 'vibes') setDestination(returnTo);
    setSettings({ page });
  };
  const requestedAgent = useNotificationNavigation(workspace, accountWorkspace.account?.email ?? null, {
    close: () => { setSettings(null); setDrawer(false); }, mode: setProductMode, chat: nav.enterIdeas,
    work: () => setDestination('work'), computers: () => setDestination('computers'),
    security: () => openSettings('remoteAccess'),
  });
  const lead = (to: Destination) => { setProductMode('work'); setSettingsLed(to); setDestination(to); };
  const project = destination === 'work' ? (connected ? workspace.projects : workspace.remembered?.projects ?? []).find(item => item.id === projectId) : undefined;
  const session = project && !nav.launcherOpen ? projectSession(workspace.sessions, project.id, nav.focusedSessionId, workspace.selectedSessionId) : undefined;
  const chat = chats.find(item => item.id === selected);
  // A computer project shows one of its own chats while that chat is open.
  const phoneChat = Boolean(nav.projectChatOpen && project && chat && chatProjectId(chat, workspace) === project.id);
  const terminalLauncher = destination === 'work' && Boolean(project && !session && !phoneChat);
  useMobileScreenAnalytics({ enabled: workspace.onboarding.status === 'complete', settings: Boolean(settings),
    destination, agentMode, phoneChat, inProject: Boolean(session || project) });
  useEffect(() => { setSettings(null); }, [workspace.demo, workspace.onboarding.status]);
  const showChat = () => { setProductMode('work'); nav.showSelectedChat(); };
  const vaultChat = useVaultChat(workspace, showChat);
  const useIntegrationInChat = (mention: string) => {
    if (vibesEnabled && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDraftForScope(vibesDraftKey(workspace.account?.email, 'new'), mention + ' ');
    setProductMode('work'); nav.enterIdeas(null);
  };
  const start = (id: string) => { setProductMode('work'); nav.newTerminal(id); };
  const covered = drawer || connect || newProject || settings !== null;
  const previewProjectId = connected && workspace.previewAvailable && project && !isIdeas(project)
    && project.kind !== 'vault' && project.kind !== 'railway' ? project.id : undefined;
  const previewTarget = useLivePreviewTarget(workspace, previewProjectId, !agentMode && destination === 'work');
  const openPreview = () => { openLivePreview(); void analytics?.track({ event: 'mobile_preview_opened', properties: {} }); };
  if (workspace.onboarding.status !== 'complete' || (!workspace.account && !accountWorkspace.account))
    return <ThemeContext.Provider value={theme}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <OnboardingFlow workspace={workspace} />
  </ThemeContext.Provider>;
  if (destination === 'vibes') return <ThemeContext.Provider value={theme}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: colors.background }]}>
      <View aria-hidden={walletSignIn} accessibilityElementsHidden={walletSignIn}
        importantForAccessibility={walletSignIn ? 'no-hide-descendants' : 'auto'}
        style={[s.frame, width > 700 && { maxWidth: 820 }]}>
        <WalletScreen signedIn={Boolean(workspace.account)} onSignIn={() => setWalletSignIn(true)}
          onBack={() => { setDestination(returnTo); openSettings('vibes'); }}
          onClose={() => { setDestination(returnTo); if (walletFrom) openSettings(walletFrom); }} />
      </View>
      <AccountSheet visible={walletSignIn} workspace={workspace} onClose={() => setWalletSignIn(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
  // The Work/Agent switch sits where the home is: Ideas, the chat the app opens into.
  const modeSwitch = agentsAvailable && destination === 'work' && !terminalLauncher;
  return <ThemeContext.Provider value={theme}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    {/* The Settings sheet covers the whole screen, status bar included, so the safe
        area belongs to the screen inside this rather than to the root. */}
    <View style={[s.safe, { backgroundColor: colors.background }]}>
    <SafeAreaView style={s.safe}>
      <View aria-hidden={covered} accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        style={[s.frame, width > 700 && { maxWidth: 820 }]}>
        <View style={[s.body, agentMode && { display: 'none' }]} accessibilityElementsHidden={agentMode} importantForAccessibility={agentMode ? 'no-hide-descendants' : 'auto'}>
        <AppHeader modeSwitch={modeSwitch ? <ProductModeSwitch mode="work" onChange={setProductMode} /> : undefined} terminalLauncher={terminalLauncher}
          destination={destination} workspace={workspace} session={session} project={project} connected={connected}
          compact={compact} onMenu={() => setDrawer(true)} onNewChat={project ? nav.newChat : undefined}
          onBack={terminalLauncher ? nav.backFromTerminalLauncher : settingsLed === destination ? () => { setSettingsLed(null); openSettings(); } : undefined}
          onSwitchChat={() => setDrawer(true)} onComputers={() => setDestination('computers')}
          onSessionOptions={session ? () => setSessionOptions(true) : undefined}
          onPreview={previewProjectId && !terminalLauncher ? openPreview : undefined} />
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={`${workspace.host?.id}:${session.id}`} session={session} workspace={workspace} active={!agentMode && !covered}
            onWallet={() => openSettings('vibes')} options={sessionOptions} onCloseOptions={() => setSessionOptions(false)}
            previewProjectId={previewProjectId} onPreview={previewProjectId ? openPreview : undefined} /> :
            vibesEnabled && phoneChat ? <VibesScreen active={!agentMode && !covered} workspace={workspace} computer={connected && !workspace.viewOnly}
              onWallet={() => openSettings('vibes')} onIntegrations={() => setDestination('integrations')}
              onMemory={() => openSettings('memory')} previewProjectId={previewProjectId}
              onPreview={previewProjectId ? openPreview : undefined} /> :
              project ? <ProjectTerminalLauncher key={`${workspace.host?.id}:${project.id}`} workspace={workspace} project={project}
                onIntegrations={() => openSettings('accounts')} onWallet={() => openSettings('vibes')} onOpenSession={nav.openSession} onConnect={() => setConnect(true)} /> :
              <WorkScreen workspace={workspace} connected={connected}
                onProjects={() => setDrawer(true)}
                onNewProject={() => connected ? setNewProject(true) : setConnect(true)} onConnect={() => setConnect(true)}
                onAgents={agentsAvailable ? () => setProductMode('agent') : undefined} />)}
          {destination === 'computers' && <ComputersScreen workspace={workspace} />}
          {destination === 'integrations' && <IntegrationsScreen onUse={useIntegrationInChat}
            signedIn={Boolean(accountWorkspace.account)} workspace={workspace} vault={vaultChat}
            onConnectComputer={() => setConnect(true)} />}
        </View>
        </View>
      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace} project={project} currentProjectId={projectId}
        onClose={() => setDrawer(false)} onNew={() => nav.enterIdeas(null)} onSettings={() => openSettings()} onReport={() => openSettings('report')}
        onBalance={() => openSettings('vibes')} onLeaveProject={nav.leaveProject} onNewTerminal={start}
        onNewProject={() => { if (connected) setNewProject(true); else setConnect(true); }}
        onEnterProject={id => { setProductMode('work'); nav.enterProject(id); }}
        onOpenSession={id => { setProductMode('work'); nav.openSession(id); }}
        onNavigate={to => { setProductMode('work'); if (to === 'vibes') openWallet(); else setDestination(to); }}
        chats={vibesEnabled ? (query, projectId) => <VibesDrawer compact query={query} projectId={projectId} workspace={workspace} onOpen={showChat} /> : undefined} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} /></SafeAreaView>
        {agentsAvailable && <View style={[StyleSheet.absoluteFill, !agentMode && { display: 'none' }]} accessibilityElementsHidden={!agentMode || covered} importantForAccessibility={agentMode && !covered ? 'auto' : 'no-hide-descendants'}>
          {sampleAgents ? <IntegrationsProvider api={null} identity="sample-agents">
            <AgentsScreen key="sample" api={sampleAgents.agentsApi} chatApi={sampleAgents.chatApi} workspace={agentWorkspace}
              active={agentMode && !covered} onMode={setProductMode} onMenu={() => openSettings()} onReport={() => openSettings('report')} onWallet={() => openSettings('vibes')} />
          </IntegrationsProvider> : <AgentsScreen key={accountWorkspace.account?.email ?? 'guest'} api={agentsApi!} chatApi={agentChatApi!} workspace={agentWorkspace} requestedAgent={requestedAgent}
            active={agentMode && !covered} onMode={setProductMode} onMenu={() => openSettings()} onReport={() => openSettings('report')} onWallet={() => openSettings('vibes')} />}
        </View>}
      <NewProjectSheet visible={newProject} workspace={workspace} onClose={() => setNewProject(false)} onDone={nav.projectBuilt} />
      {previewProjectId && <PreviewSessionSheet key={`${workspace.host?.id}:${previewProjectId}`} visible={livePreview} onClose={() => setLivePreview(false)}
          projectId={previewProjectId} workspace={workspace} known={previewTarget} />}
    <SettingsSheet visible={settings !== null} initialPage={settings?.page} workspace={workspace} onClose={() => setSettings(null)}
      routes={{ agents: (sampleAgents?.agentsApi ?? agentsApi) ? { api: (sampleAgents?.agentsApi ?? agentsApi)!, identity: `${workspace.demo ? 'sample:' : ''}${workspace.account?.email ?? 'guest'}` } : undefined, plugins: () => lead('integrations'), wallet: openWallet, playLaunchVideo: onPlayLaunchVideo,
        remote: () => lead('computers'), connect: () => setConnect(true) }} />
    <FirstRunTour workspace={workspace} connected={connected} agentsAvailable={agentsAvailable}
      blocked={covered || agentMode} home={destination === 'work' && !project && !session && !phoneChat}
      onPrepare={() => { setProductMode('work'); nav.leaveProject(); }} />
    </View></ThemeContext.Provider>;
}
