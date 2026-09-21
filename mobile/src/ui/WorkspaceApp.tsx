import { useFonts } from 'expo-font';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { AppHeader } from './AppHeader';
import { ThemeContext } from '../theme';
import { computerMode } from './mode';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewSessionSheet } from './NewSessionSheet';
import { NewProjectSheet } from './newProject/NewProjectSheet';
import { IntegrationsScreen } from './IntegrationsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsSheet } from '../settings/SettingsSheet';
import type { SettingsPageId } from '../settings/pages';
import { AccountSheet } from './AccountSheet';
import { WorkScreen } from './WorkScreen';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesDrawer } from '../vibes/VibesDrawer';
import { WalletScreen } from '../vibes/WalletScreen';
import { useVibesChats, useVibesStore } from '../vibes/VibesProvider';
import { useVaultChat } from '../vibes/useVaultChat';
import { vibesDraftKey } from '../vibes/draftScope';
import { openPhoneChat } from '../vibes/openPhoneChat';
import { setDraftForScope } from './useDraft';
import { chatProjectId, ideasProject } from './ideas';
import { useProjectNavigation } from './useProjectNavigation';
import type { Destination, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace, accountWorkspace = workspace, vibesEnabled = false, agentsApi, agentChatApi }: {
  agentsApi?: AgentsApi; agentChatApi?: VibesApi;
  workspace: WorkspaceModel;
  /** The real account, which Integrations uses even while the sample workspace is on screen. */
  accountWorkspace?: WorkspaceModel;
  vibesEnabled?: boolean;
}) {
  const sampleAgents = useMemo(() => workspace.demo ? createSampleAgents() : null, [workspace.demo]);
  const agentWorkspace = sampleAgents ? { ...workspace, account: workspace.account ?? demoAccount } : accountWorkspace;
  const [productMode, setProductMode] = useProductMode(sampleAgents ? `sample:${agentWorkspace.account!.email}` : accountWorkspace.account?.email ?? null);
  // Product navigation is visible in samples and on every platform, independently of phone-chat availability.
  const agentsAvailable = Boolean(sampleAgents || agentsApi && agentChatApi);
  const agentMode = agentsAvailable && productMode === 'agent';
  useFonts({ 'DM Sans': require('../../assets/fonts/DMSans.ttf') });
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = workspacePalette(dark, workspace.accent);
  // One object per theme: a fresh one re-renders every screen reading it, which
  // hands any animation running there back to its drivers mid-flight.
  const theme = useMemo(() => ({ colors, dark }), [colors, dark]);
  const connected = computerMode(workspace);
  const vibes = useVibesStore();
  const { chats, selected } = useVibesChats();
  const nav = useProjectNavigation(workspace, vibes);
  const { destination, setDestination, projectId, drawer, setDrawer } = nav;
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [sessionOptions, setSessionOptions] = useState(false);
  const [settings, setSettings] = useState<{ page?: SettingsPageId } | null>(null);
  const [walletSignIn, setWalletSignIn] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const [returnTo, setReturnTo] = useState<Destination>('work');
  // The Settings page the upgrade screen was opened from, so Close returns there too.
  const [walletFrom, setWalletFrom] = useState<SettingsPageId | null>(null);
  // A destination Settings led to keeps a Back to Settings until the place changes.
  const [settingsLed, setSettingsLed] = useState<Destination | null>(null);
  useEffect(() => { if (settingsLed && settingsLed !== destination) setSettingsLed(null); }, [destination, settingsLed]);
  const openWallet = (from?: SettingsPageId) => { setWalletFrom(from ?? null); setReturnTo(destination); setDrawer(false); setDestination('vibes'); };
  const openSettings = (page?: SettingsPageId) => {
    setDrawer(false);
    if (destination === 'vibes') setDestination(returnTo);
    setSettings({ page });
  };
  // Settings rows lead into the Work body, which the Agent tab hides, so they switch back to Work.
  const lead = (to: Destination) => { setProductMode('work'); setSettingsLed(to); setDestination(to); };
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  const project = destination === 'work' ? (connected ? workspace.projects : workspace.remembered?.projects ?? []).find(item => item.id === projectId) : undefined;
  // Ideas, or a folder the computer no longer lists: the phone's own chat surface.
  const ideas = destination === 'work' && !session && !project;
  const chat = chats.find(item => item.id === selected);
  // A computer project shows one of its own chats while that chat is open.
  const phoneChat = ideas || Boolean(project && chat && chatProjectId(chat, workspace) === project.id);
  useEffect(() => { setConnect(false); setNewSession(false); setSettings(null); }, [workspace.demo, workspace.onboarding.status]);
  useEffect(() => { setSessionOptions(false); }, [workspace.selectedSessionId]);
  // Whatever chat the store has selected, shown inside the project it belongs to.
  const showChat = () => { setProductMode('work'); nav.showSelectedChat(); };
  const vaultChat = useVaultChat(workspace, showChat);
  const useIntegrationInChat = (mention: string) => {
    if (vibesEnabled && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDraftForScope(vibesDraftKey(workspace.account?.email, 'new'), mention + ' ');
    setProductMode('work'); nav.enterIdeas(null);
  };
  const start = (projectId?: string) => {
    setInitialProjectId(projectId);
    if (connected) setNewSession(true); else setConnect(true);
  };
  if (workspace.onboarding.status !== 'complete') return <ThemeContext.Provider value={theme}>
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
  const covered = drawer || connect || newSession || newProject || settings !== null;
  const shown = project ?? (ideas ? ideasProject : undefined);
  // The Work/Agent switch sits where the home is: Ideas, the chat the app opens into.
  const modeSwitch = agentsAvailable && destination === 'work';
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
        <AppHeader modeSwitch={modeSwitch ? <ProductModeSwitch mode="work" onChange={setProductMode} /> : undefined} destination={destination} workspace={workspace} session={session} project={shown} connected={connected}
          compact={compact} onMenu={() => setDrawer(true)} onNewChat={nav.newChat}
          onBack={settingsLed === destination ? () => { setSettingsLed(null); openSettings(); } : undefined}
          onSwitchChat={() => setDrawer(true)} onComputers={() => setDestination('computers')}
          onSessionOptions={session && session.runner !== 'conversation' ? () => setSessionOptions(true) : undefined} />
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace}
            onPhoneChat={vibesEnabled && vibes ? model => openPhoneChat(vibes, model, showChat) : undefined} onUpgrade={() => openSettings('vibes')}
            options={sessionOptions} onCloseOptions={() => setSessionOptions(false)} /> :
            vibesEnabled && phoneChat ? <VibesScreen active={!agentMode && !covered} workspace={workspace} computer={connected && !workspace.viewOnly}
              onWallet={() => openSettings('vibes')} onIntegrations={() => setDestination('integrations')}
              onMemory={() => openSettings('memory')} /> :
              <WorkScreen workspace={workspace} project={project} cloud={vibesEnabled} connected={connected} onWallet={() => openSettings('vibes')}
                onProjects={() => setDrawer(true)} onPhoneChat={showChat} />)}
          {destination === 'computers' && <ComputersScreen workspace={workspace} />}
          {destination === 'integrations' && <IntegrationsScreen onUse={useIntegrationInChat}
            signedIn={Boolean(accountWorkspace.account)} workspace={workspace} vault={vaultChat}
            onConnectComputer={() => setConnect(true)} />}
        </View>
        </View>

      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace} project={project} currentProjectId={projectId}
        onClose={() => setDrawer(false)} onNew={() => nav.enterIdeas(null)} onSettings={() => openSettings()}
        onBalance={() => openSettings('vibes')} onLeaveProject={nav.leaveProject} onNewTerminal={start}
        onNewProject={() => { if (connected) setNewProject(true); else setConnect(true); }}
        onEnterProject={id => { setProductMode('work'); nav.enterProject(id); }}
        onNavigate={to => { setProductMode('work'); if (to === 'vibes') openWallet(); else setDestination(to); }}
        chats={vibesEnabled ? (query, projectId) => <VibesDrawer compact query={query} projectId={projectId} workspace={workspace} onOpen={showChat} /> : undefined} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        onClose={() => setNewSession(false)} onOpenChat={vibesEnabled ? showChat : undefined} />
    </SafeAreaView>
        {agentsAvailable && <View style={[StyleSheet.absoluteFill, !agentMode && { display: 'none' }]} accessibilityElementsHidden={!agentMode || covered} importantForAccessibility={agentMode && !covered ? 'auto' : 'no-hide-descendants'}>
          {sampleAgents ? <IntegrationsProvider api={null} identity="sample-agents">
            <AgentsScreen key="sample" api={sampleAgents.agentsApi} chatApi={sampleAgents.chatApi} workspace={agentWorkspace}
              active={agentMode && !covered} onMode={setProductMode} onMenu={() => openSettings()} onWallet={() => openSettings('vibes')} />
          </IntegrationsProvider> : <AgentsScreen key={accountWorkspace.account?.email ?? 'guest'} api={agentsApi!} chatApi={agentChatApi!} workspace={agentWorkspace}
            active={agentMode && !covered} onMode={setProductMode} onMenu={() => openSettings()} onWallet={() => openSettings('vibes')} />}
        </View>}
    <NewProjectSheet visible={newProject} workspace={workspace} onClose={() => setNewProject(false)} onDone={nav.projectBuilt} />
    <SettingsSheet visible={settings !== null} initialPage={settings?.page} workspace={workspace} onClose={() => setSettings(null)}
      routes={{ plugins: () => lead('integrations'), wallet: openWallet,
        remote: () => lead('computers'), connect: () => setConnect(true) }} />
    </View>
  </ThemeContext.Provider>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, frame: { flex: 1, width: '100%', alignSelf: 'center' }, body: { flex: 1 },
});
