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
import { paletteFor, ThemeContext } from '../theme';
import { computerHome, computerMode, computerRemembered } from './mode';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewSessionSheet } from './NewSessionSheet';
import { NewProjectSheet } from './newProject/NewProjectSheet';
import { IntegrationsScreen } from './IntegrationsScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsSheet } from '../settings/SettingsSheet';
import type { SettingsPageId } from '../settings/pages';
import { AccountPanel, AccountSheet } from './AccountSheet';
import { WorkScreen } from './WorkScreen';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesDrawer } from '../vibes/VibesDrawer';
import { WalletScreen } from '../vibes/WalletScreen';
import { useVibesStore } from '../vibes/VibesProvider';
import { useVaultChat } from '../vibes/useVaultChat';
import { vibesDraftKey } from '../vibes/draftScope';
import { openPhoneChat } from '../vibes/openPhoneChat';
import { setDraftForScope } from './useDraft';
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
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = paletteFor(dark, workspace.accent);
  // One object per theme: a fresh one re-renders every screen reading it, which
  // hands any animation running there back to its drivers mid-flight.
  const theme = useMemo(() => ({ colors, dark }), [colors, dark]);
  const connected = computerMode(workspace);
  const computerIsHome = computerHome(workspace);
  const vibes = useVibesStore();
  const [aiHome, setAiHome] = useState(true);
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [sessionOptions, setSessionOptions] = useState(false);
  const [settings, setSettings] = useState<{ page?: SettingsPageId } | null>(null);
  const [walletSignIn, setWalletSignIn] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<Destination>('work');
  const openWallet = () => { setReturnTo(destination); setDrawer(false); setDestination('vibes'); };
  const openSettings = (page?: SettingsPageId) => {
    setDrawer(false);
    if (destination === 'vibes') setDestination(returnTo);
    setSettings({ page });
  };
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  const project = destination === 'work' && connected ? workspace.projects.find(item => item.id === projectId) : undefined;
  useEffect(() => { setDestination('work'); setDrawer(false); setConnect(false); setNewSession(false); setSettings(null); },
    [workspace.demo, workspace.onboarding.status]);
  useEffect(() => { setSessionOptions(false); if (workspace.selectedSessionId) setDestination('work'); }, [workspace.selectedSessionId]);
  useEffect(() => {
    const open = workspace.sessions.find(item => item.id === workspace.selectedSessionId);
    if (open) setProjectId(open.projectId);
  }, [workspace.selectedSessionId, workspace.sessions]);
  useEffect(() => { if (!connected) setProjectId(null); }, [connected]);
  // A reconnect behind Agent keeps the existing Work route and its mounted composer.
  useEffect(() => { if (!agentMode) setAiHome(!computerIsHome); }, [computerIsHome]);
  // Losing the computer no longer takes you off its Projects page: the page
  // reads from what that computer was last seen sharing, and refuses the rest.
  // A phone that has never paired one has nothing to read, so it still leaves.
  const remembered = computerRemembered(workspace);
  useEffect(() => {
    if (destination === 'projects' && !connected && !remembered) setDestination('work');
  }, [connected, remembered, destination]);
  const home = () => {
    workspace.actions.selectSession(null);
    if (vibesEnabled && aiHome && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDestination('work');
  };
  const openAI = () => { setProductMode('work'); setAiHome(true); setProjectId(null); workspace.actions.selectSession(null); setDestination('work'); setDrawer(false); };
  const enterProject = (id: string) => {
    setProjectId(id); setAiHome(false); workspace.actions.selectSession(null); setDestination('work'); setDrawer(true);
  };
  const projectBuilt = (built: { id: string }, openTerminal: boolean) => {
    setNewProject(false); setProjectId(built.id); setAiHome(false); setDestination('work');
    if (openTerminal) void workspace.actions.createSession(built.id, 'shell', 'Terminal').catch(() => {}); else setDrawer(true);
  };
  const leaveProject = () => { setProjectId(null); workspace.actions.selectSession(null); setDestination('work'); };
  const vaultChat = useVaultChat(workspace, openAI);
  const useIntegrationInChat = (mention: string) => {
    if (vibesEnabled && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDraftForScope(vibesDraftKey(workspace.account?.email, 'new'), mention + ' ');
    openAI();
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
          onBack={() => { setDestination(returnTo); openSettings('vibes'); }} onClose={() => setDestination(returnTo)} />
      </View>
      <AccountSheet visible={walletSignIn} workspace={workspace} onClose={() => setWalletSignIn(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
  const covered = drawer || connect || newSession || newProject || settings !== null;
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
        <AppHeader modeSwitch={agentsAvailable && destination === 'work' && !session && !project ? <ProductModeSwitch mode="work" onChange={setProductMode} /> : undefined} destination={destination} workspace={workspace} session={session} project={project} connected={connected}
          compact={compact} onMenu={() => setDrawer(true)} onNewChat={home}
          onSwitchChat={() => setDrawer(true)} onComputers={() => setDestination('computers')}
          onSessionOptions={session && session.runner !== 'conversation' ? () => setSessionOptions(true) : undefined} />
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace}
            onPhoneChat={vibesEnabled && vibes ? model => openPhoneChat(vibes, model, openAI) : undefined} onUpgrade={() => openSettings('vibes')}
            options={sessionOptions} onCloseOptions={() => setSessionOptions(false)} /> :
            vibesEnabled && aiHome ? <VibesScreen active={!agentMode && !covered} workspace={workspace} onComputer={connected ? () => setAiHome(false) : undefined}
              onWallet={() => openSettings('vibes')} onIntegrations={() => setDestination('integrations')}
              onMemory={() => openSettings('memory')} /> :
              <WorkScreen workspace={workspace} project={project} cloud={vibesEnabled} connected={connected} onWallet={() => openSettings('vibes')}
                onConnect={() => setConnect(true)}
                onProjects={() => setDestination('projects')} onAi={() => setAiHome(true)} />)}
          {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onOpen={enterProject}
            onNew={() => setNewProject(true)} />}
          {destination === 'computers' && <ComputersScreen workspace={workspace} />}
          {destination === 'integrations' && <IntegrationsScreen onUse={useIntegrationInChat}
            signedIn={Boolean(accountWorkspace.account)} workspace={workspace} vault={vaultChat}
            onConnectComputer={() => setConnect(true)} />}
        </View>
        </View>

      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace} project={project}
        onClose={() => setDrawer(false)} onNew={home} onSettings={() => openSettings()}
        onBalance={() => openSettings('vibes')} onLeaveProject={leaveProject} onNewTerminal={start}
        onNavigate={to => { setProductMode('work'); if (to === 'vibes') openWallet(); else setDestination(to); }}
        extraChats={vibesEnabled ? (query: string) => <VibesDrawer query={query} onOpen={openAI} /> : undefined} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        onClose={() => setNewSession(false)} onOpenChat={vibesEnabled ? openAI : undefined} />
    </SafeAreaView>
        {agentsAvailable && <View style={[StyleSheet.absoluteFill, !agentMode && { display: 'none' }]} accessibilityElementsHidden={!agentMode || covered} importantForAccessibility={agentMode && !covered ? 'auto' : 'no-hide-descendants'}>
          {sampleAgents ? <IntegrationsProvider api={null} identity="sample-agents">
            <AgentsScreen key="sample" api={sampleAgents.agentsApi} chatApi={sampleAgents.chatApi} workspace={agentWorkspace}
              active={agentMode && !covered} onMode={setProductMode} onMenu={() => setDrawer(true)} onWallet={() => openSettings('vibes')} />
          </IntegrationsProvider> : <AgentsScreen key={accountWorkspace.account?.email ?? 'guest'} api={agentsApi!} chatApi={agentChatApi!} workspace={agentWorkspace}
            active={agentMode && !covered} onMode={setProductMode} onMenu={() => setDrawer(true)} onWallet={() => openSettings('vibes')} />}
        </View>}
    <NewProjectSheet visible={newProject} workspace={workspace} onClose={() => setNewProject(false)} onDone={projectBuilt} />
    <SettingsSheet visible={settings !== null} initialPage={settings?.page} workspace={workspace} onClose={() => setSettings(null)}
      routes={{ plugins: () => setDestination('integrations'), wallet: openWallet,
        remote: () => setDestination('computers'), connect: () => setConnect(true) }} />
    </View>
  </ThemeContext.Provider>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, frame: { flex: 1, width: '100%', alignSelf: 'center' }, body: { flex: 1 },
});
