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
import { setDraftForScope } from './useDraft';
import { WorkScreen } from './WorkScreen';
import type { Destination, SessionKind, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace }: { workspace: WorkspaceModel }) {
  const systemScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = dark ? palettes.dark : palettes.light;
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const [initialKind, setInitialKind] = useState<SessionKind>('claude');
  const [initialPrompt, setInitialPrompt] = useState('');
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  useEffect(() => { setDestination('work'); setDrawer(false); setConnect(false); setNewSession(false); }, [workspace.demo, workspace.onboarding.status]);
  useEffect(() => { if (workspace.selectedSessionId) setDestination('work'); }, [workspace.selectedSessionId]);
  const home = () => { workspace.actions.selectSession(null); setDestination('work'); };
  const start = (projectId?: string, kind: SessionKind = 'claude', prompt = '') => {
    setInitialProjectId(projectId); setInitialKind(kind); setInitialPrompt(prompt);
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
      <View aria-hidden={drawer || connect || newSession} accessibilityElementsHidden={drawer || connect || newSession}
        importantForAccessibility={drawer || connect || newSession ? 'no-hide-descendants' : 'auto'}
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
            <WorkScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={start} onProjects={() => setDestination('projects')} />)}
          {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={start} />}
          {destination === 'computers' && <ComputersScreen workspace={workspace} onConnect={() => setConnect(true)} />}
          {destination === 'settings' && <SettingsScreen workspace={workspace} />}
        </View>
      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace}
        onClose={() => setDrawer(false)} onNavigate={setDestination} onNew={home} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId}
        initialKind={initialKind} initialPrompt={initialPrompt}
        onCreated={() => { if (initialPrompt) setDraftForScope(`${workspace.demo ? 'sample' : 'live'}:new-chat`, ''); }} onClose={() => setNewSession(false)} />
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
