import { useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { palettes, ThemeContext } from '../theme';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewSessionSheet } from './NewSessionSheet';
import { ProjectsScreen } from './ProjectsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsScreen } from './SettingsScreen';
import { Icon, IconButton } from './primitives';
import { WorkScreen } from './WorkScreen';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesDrawer } from '../vibes/VibesDrawer';
import { VibesBalanceRow } from '../vibes/VibesBalanceRow';
import { WalletSheet } from '../vibes/WalletSheet';
import type { Destination, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace, vibesEnabled = false }: { workspace: WorkspaceModel; vibesEnabled?: boolean }) {
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = dark ? palettes.dark : palettes.light;
  const [aiHome, setAiHome] = useState(vibesEnabled);
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [wallet, setWallet] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  useEffect(() => { setDestination('work'); setDrawer(false); setConnect(false); setNewSession(false); }, [workspace.demo, workspace.onboarding.status]);
  useEffect(() => { if (workspace.selectedSessionId) setDestination('work'); }, [workspace.selectedSessionId]);
  const home = () => { workspace.actions.selectSession(null); setAiHome(vibesEnabled); setDestination('work'); };
  const openAI = () => { home(); setDrawer(false); };
  // Only the Projects list still configures a session up front; there the folder
  // is the point of the action. The home composer never opens this sheet.
  const start = (projectId?: string) => {
    setInitialProjectId(projectId);
    if (workspace.status === 'connected') setNewSession(true); else setConnect(true);
  };
  // One-time first-run gate. Everything below renders exactly as before once it is complete.
  if (workspace.onboarding.status !== 'complete') return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <OnboardingFlow workspace={workspace} />
  </ThemeContext.Provider>;
  return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View aria-hidden={drawer || connect || newSession || wallet} accessibilityElementsHidden={drawer || connect || newSession || wallet}
        importantForAccessibility={drawer || connect || newSession || wallet ? 'no-hide-descendants' : 'auto'}
        style={[s.frame, width > 700 && { maxWidth: 820 }]}>
        <View style={[s.header, compact && { minHeight: 44, paddingVertical: 0 }]}>
          <IconButton icon="menu-outline" label="Open navigation menu" onPress={() => setDrawer(true)} />
          <Pressable accessibilityRole="button" accessibilityLabel={session ? 'Switch chat' : 'Choose computer'}
            onPress={() => session ? setDrawer(true) : workspace.status === 'connected' ? setDestination('computers') : setConnect(true)} style={s.heading}>
            <View style={s.headingRow}><Text numberOfLines={1} style={[s.brand, { color: colors.text }, session && s.sessionTitle]}>{session?.title ?? 'Vibyra'}</Text>
              <Icon name="chevron-down" size={12} color={colors.muted} /></View>
            {!compact && <View style={s.connection}>
              <View style={[s.dot, { backgroundColor: workspace.demo ? colors.muted : workspace.status === 'connected' ? colors.success : colors.border }]} />
              <Text numberOfLines={1} style={[s.computer, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace' :
                workspace.status === 'connected' ? workspace.host?.name : workspace.status === 'connecting' ? 'Connecting…' : 'Computer offline'}</Text>
            </View>}
          </Pressable>
          <IconButton icon="create-outline" label="New chat" onPress={home} />
        </View>
        <View style={s.body}>
          {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace} /> :
            vibesEnabled && aiHome ? <VibesScreen workspace={workspace} onComputer={() => setAiHome(false)} /> :
              <WorkScreen workspace={workspace} cloud={vibesEnabled} onConnect={() => setConnect(true)}
                onProjects={() => setDestination('projects')} onAi={() => setAiHome(true)} />)}
          {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={start} />}
          {destination === 'computers' && <ComputersScreen workspace={workspace} onConnect={() => setConnect(true)} />}
          {destination === 'settings' && <SettingsScreen workspace={workspace} />}
        </View>
      </View>
      {/* The balance is never gated on `vibesEnabled`: plans must be readable on
          every runtime, and only the purchase button needs the native bridge. */}
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace}
        onClose={() => setDrawer(false)} onNavigate={setDestination} onNew={home}
        extraChats={vibesEnabled ? <VibesDrawer onOpen={openAI} /> : undefined}
        balance={<VibesBalanceRow signedIn={Boolean(workspace.account)}
          onWallet={() => { setDrawer(false); setWallet(true); }}
          onSignIn={() => { setDrawer(false); setDestination('settings'); }} />} />
      <WalletSheet visible={wallet} onClose={() => setWallet(false)} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        onClose={() => setNewSession(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, frame: { flex: 1, width: '100%', alignSelf: 'center' }, body: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12, paddingVertical: 7 },
  heading: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  brand: { fontSize: 20, fontWeight: '600', letterSpacing: -0.6, flexShrink: 1 }, sessionTitle: { fontSize: 15, letterSpacing: -0.2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' }, dot: { width: 5, height: 5, borderRadius: 3 },
  computer: { fontSize: 10, flexShrink: 1 },
});
