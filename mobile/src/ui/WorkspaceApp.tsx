import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { AppHeader } from './AppHeader';
import { paletteFor, ThemeContext } from '../theme';
import { computerHome, computerMode } from './mode';
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
import { vibesDraftKey } from '../vibes/draftScope';
import { openPhoneChat } from '../vibes/openPhoneChat';
import { setDraftForScope } from './useDraft';
import type { Destination, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace, accountWorkspace = workspace, vibesEnabled = false }: {
  workspace: WorkspaceModel;
  /** The real account, which Integrations uses even while the sample workspace is on screen. */
  accountWorkspace?: WorkspaceModel;
  vibesEnabled?: boolean;
}) {
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = paletteFor(dark, workspace.accent);
  const connected = computerMode(workspace);
  const computerIsHome = computerHome(workspace);
  const vibes = useVibesStore();
  const [aiHome, setAiHome] = useState(true);
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [newProject, setNewProject] = useState(false);
  // The open terminal's options sheet: the header holds its ⋯, the screen the sheet.
  const [sessionOptions, setSessionOptions] = useState(false);
  // The Settings sheet, and the page it opens on (none: its list).
  const [settings, setSettings] = useState<{ page?: SettingsPageId } | null>(null);
  // Signing in from the tokens page. The sheet belongs here rather than inside the
  // Vibes area, which is kept free of the workspace model; the rail's own row is
  // gated on an account, but the "Vibyra tokens" row is not and never was.
  const [walletSignIn, setWalletSignIn] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  // The project you are in. Entered from the Projects page or by opening one of
  // its terminals; left through the rail's back arrow or by opening a phone chat.
  // It lives only on the work surface: every other page shows the rail's home face.
  const [projectId, setProjectId] = useState<string | null>(null);
  // Where the X goes back to. The upgrade page is opened from anywhere, so it
  // returns to wherever it was opened from rather than to a fixed screen.
  const [returnTo, setReturnTo] = useState<Destination>('work');
  const openWallet = () => { setReturnTo(destination); setDrawer(false); setDestination('vibes'); };
  // Settings is a sheet over the current screen. The full-screen wallet has no room for
  // one, so opening Settings from there first returns to where the wallet was opened.
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
  // Opening a terminal puts you in its project; the rail then shows that project's face.
  useEffect(() => {
    const open = workspace.sessions.find(item => item.id === workspace.selectedSessionId);
    if (open) setProjectId(open.projectId);
  }, [workspace.selectedSessionId, workspace.sessions]);
  useEffect(() => { if (!connected) setProjectId(null); }, [connected]);
  // Connecting a computer makes its workspace the home; losing it returns the phone
  // to its own chat rather than leaving a computer surface with nothing behind it.
  // A watch-only Mac keeps the phone's chat as the home (see `computerHome`).
  useEffect(() => { setAiHome(!computerIsHome); }, [computerIsHome]);
  // Projects needs a computer that is answering. Remote does not: without one it is
  // the install-and-find flow, so it stays reachable at every connection state.
  useEffect(() => {
    if (destination === 'projects' && !connected) setDestination('work');
  }, [connected, destination]);
  // New chat stays on the surface you are using: the computer composer, or a genuinely
  // empty AI chat rather than the conversation that happened to be open.
  const home = () => {
    workspace.actions.selectSession(null);
    if (vibesEnabled && aiHome && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDestination('work');
  };
  const openAI = () => { setAiHome(true); setProjectId(null); workspace.actions.selectSession(null); setDestination('work'); setDrawer(false); };
  // Entering a project makes it the home and opens the rail on its face at once,
  // so the tap lands on the project's terminals rather than on an empty composer.
  const enterProject = (id: string) => {
    setProjectId(id); setAiHome(false); workspace.actions.selectSession(null); setDestination('work'); setDrawer(true);
  };
  // A project the computer just built: it becomes the home, and either the rail opens on
  // its (empty) terminals or, when the option was left on, a terminal is started in it.
  const projectBuilt = (built: { id: string }, openTerminal: boolean) => {
    setNewProject(false); setProjectId(built.id); setAiHome(false); setDestination('work');
    if (openTerminal) void workspace.actions.createSession(built.id, 'shell', 'Terminal').catch(() => {}); else setDrawer(true);
  };
  // The rail's back arrow: the screen returns to the home, the rail to all chats, and stays open.
  const leaveProject = () => { setProjectId(null); workspace.actions.selectSession(null); setDestination('work'); };
  // An integration's "use it in a chat" opens an empty chat with the mention already
  // typed, so the thing its page just described is one tap from happening. The
  // draft is written before the move, because the composer reads it on mount.
  const useIntegrationInChat = (mention: string) => {
    if (vibesEnabled && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDraftForScope(vibesDraftKey(workspace.account?.email, 'new'), mention + ' ');
    openAI();
  };
  // Only the project's own rail still configures a session up front; there the
  // folder is settled. The home composer never opens this sheet.
  const start = (projectId?: string) => {
    setInitialProjectId(projectId);
    if (connected) setNewSession(true); else setConnect(true);
  };
  // One-time first-run gate. Everything below renders exactly as before once it is complete.
  if (workspace.onboarding.status !== 'complete') return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <OnboardingFlow workspace={workspace} />
  </ThemeContext.Provider>;
  // The upgrade page takes the whole screen and is closed with its own X, so it
  // replaces the workspace chrome rather than sitting under the app header. The top
  // edge is dropped because the Vibes pages are lit from above the screen and a
  // padded top started that light on a line across the notch; `WalletPage` pads the
  // inset back in itself, so nothing is left sitting under the status bar.
  if (destination === 'vibes') return <ThemeContext.Provider value={{ colors, dark }}>
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
  return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    {/* The Settings sheet covers the whole screen, status bar included, so the safe
        area belongs to the screen inside this rather than to the root. */}
    <View style={[s.safe, { backgroundColor: colors.background }]}>
    <SafeAreaView style={s.safe}>
      <View aria-hidden={covered} accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        style={[s.frame, width > 700 && { maxWidth: 820 }]}>
        <AppHeader destination={destination} workspace={workspace} session={session} project={project} connected={connected}
          compact={compact} onMenu={() => setDrawer(true)} onNewChat={home}
          onSwitchChat={() => setDrawer(true)} onComputers={() => setDestination('computers')}
          onSessionOptions={session && session.runner !== 'conversation' ? () => setSessionOptions(true) : undefined} />
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace}
            onPhoneChat={vibesEnabled && vibes ? model => openPhoneChat(vibes, model, openAI) : undefined} onUpgrade={() => openSettings('vibes')}
            options={sessionOptions} onCloseOptions={() => setSessionOptions(false)} /> :
            vibesEnabled && aiHome ? <VibesScreen workspace={workspace} onComputer={connected ? () => setAiHome(false) : undefined}
              onWallet={() => openSettings('vibes')} onIntegrations={() => setDestination('integrations')}
              onMemory={() => openSettings('memory')} /> :
              <WorkScreen workspace={workspace} project={project} cloud={vibesEnabled} connected={connected} onWallet={() => openSettings('vibes')}
                onConnect={() => setConnect(true)}
                onProjects={() => setDestination('projects')} onAi={() => setAiHome(true)} />)}
          {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onOpen={enterProject}
            onNew={() => setNewProject(true)} />}
          {destination === 'computers' && <ComputersScreen workspace={workspace} />}
          {destination === 'integrations' && <IntegrationsScreen onUse={useIntegrationInChat}
            signedIn={Boolean(accountWorkspace.account)} />}
        </View>
      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace} project={project}
        onClose={() => setDrawer(false)} onNew={home} onSettings={() => openSettings()}
        onBalance={() => openSettings('vibes')} onLeaveProject={leaveProject} onNewTerminal={start}
        onNavigate={to => (to === 'vibes' ? openWallet() : setDestination(to))}
        extraChats={vibesEnabled ? (query: string) => <VibesDrawer query={query} onOpen={openAI} /> : undefined} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        onClose={() => setNewSession(false)} onOpenChat={vibesEnabled ? openAI : undefined} />
    </SafeAreaView>
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
