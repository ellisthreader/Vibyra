import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { AppHeader } from './AppHeader';
import { palettes, ThemeContext } from '../theme';
import { computerMode } from './mode';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewSessionSheet } from './NewSessionSheet';
import { IntegrationsScreen } from './IntegrationsScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsScreen } from './SettingsScreen';
import { AccountSheet } from './AccountSheet';
import { WorkScreen } from './WorkScreen';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesDrawer } from '../vibes/VibesDrawer';
import { WalletScreen } from '../vibes/WalletScreen';
import { useVibesStore } from '../vibes/VibesProvider';
import { vibesDraftKey } from '../vibes/draftScope';
import { setDraftForScope } from './useDraft';
import type { Destination, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace, vibesEnabled = false }: { workspace: WorkspaceModel; vibesEnabled?: boolean }) {
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = dark ? palettes.dark : palettes.light;
  const connected = computerMode(workspace);
  const vibes = useVibesStore();
  const [aiHome, setAiHome] = useState(true);
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  // Signing in from the tokens page. The sheet belongs here rather than inside the
  // Vibes area, which is kept free of the workspace model; the rail's own row is
  // gated on an account, but the "Vibyra tokens" row is not and never was.
  const [walletSignIn, setWalletSignIn] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  // Where the X goes back to. The upgrade page is opened from anywhere, so it
  // returns to wherever it was opened from rather than to a fixed screen.
  const [returnTo, setReturnTo] = useState<Destination>('work');
  const openWallet = () => { setReturnTo(destination); setDrawer(false); setDestination('vibes'); };
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  useEffect(() => { setDestination('work'); setDrawer(false); setConnect(false); setNewSession(false); }, [workspace.demo, workspace.onboarding.status]);
  useEffect(() => { if (workspace.selectedSessionId) setDestination('work'); }, [workspace.selectedSessionId]);
  // Connecting a computer makes its workspace the home; losing it returns the phone
  // to its own chat rather than leaving a computer surface with nothing behind it.
  useEffect(() => { setAiHome(!connected); }, [connected]);
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
  const openAI = () => { setAiHome(true); workspace.actions.selectSession(null); setDestination('work'); setDrawer(false); };
  // An integration's "use it in a chat" opens an empty chat with the mention already
  // typed, so the thing its page just described is one tap from happening. The
  // draft is written before the move, because the composer reads it on mount.
  const useIntegrationInChat = (mention: string) => {
    if (vibesEnabled && vibes) void vibes.select(null).catch(error => vibes.error(error));
    setDraftForScope(vibesDraftKey(workspace.account?.email, 'new'), mention + ' ');
    openAI();
  };
  // Only the Projects list still configures a session up front; there the folder
  // is the point of the action. The home composer never opens this sheet.
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
          onClose={() => setDestination(returnTo)} />
      </View>
      <AccountSheet visible={walletSignIn} workspace={workspace} onClose={() => setWalletSignIn(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
  return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View aria-hidden={drawer || connect || newSession} accessibilityElementsHidden={drawer || connect || newSession}
        importantForAccessibility={drawer || connect || newSession ? 'no-hide-descendants' : 'auto'}
        style={[s.frame, width > 700 && { maxWidth: 820 }]}>
        <AppHeader destination={destination} workspace={workspace} session={session} connected={connected}
          compact={compact} onMenu={() => setDrawer(true)} onNewChat={home}
          onSwitchChat={() => setDrawer(true)} onComputers={() => setDestination('computers')} />
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace} /> :
            vibesEnabled && aiHome ? <VibesScreen workspace={workspace} onComputer={connected ? () => setAiHome(false) : undefined}
              onWallet={openWallet} /> :
              <WorkScreen workspace={workspace} cloud={vibesEnabled} connected={connected} onWallet={openWallet} onConnect={() => setConnect(true)}
                onProjects={() => setDestination('projects')} onAi={() => setAiHome(true)} />)}
          {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={start}
            onOpenSession={id => { workspace.actions.selectSession(id); setDestination('work'); }} />}
          {destination === 'computers' && <ComputersScreen workspace={workspace} />}
          {destination === 'integrations' && <IntegrationsScreen onUse={useIntegrationInChat} />}
          {destination === 'settings' && <SettingsScreen workspace={workspace} onConnect={() => setConnect(true)} />}
        </View>
      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace}
        onClose={() => setDrawer(false)} onNew={home}
        onNavigate={to => (to === 'vibes' ? openWallet() : setDestination(to))}
        extraChats={vibesEnabled ? (query: string) => <VibesDrawer query={query} onOpen={openAI} /> : undefined} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        onClose={() => setNewSession(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, frame: { flex: 1, width: '100%', alignSelf: 'center' }, body: { flex: 1 },
});
