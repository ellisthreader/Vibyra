import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../theme';
import { ComputersScreen } from './ComputersScreen';
import { ConnectScreen } from './ConnectScreen';
import { NavigationDrawer } from './NavigationDrawer';
import { NewSessionSheet } from './NewSessionSheet';
import { ProjectsScreen } from './ProjectsScreen';
import { SessionScreen } from './SessionScreen';
import { SettingsScreen } from './SettingsScreen';
import { IconButton } from './primitives';
import { WorkScreen } from './WorkScreen';
import type { Destination, WorkspaceModel } from './types';

export function WorkspaceApp({ workspace }: { workspace: WorkspaceModel }) {
  const systemScheme = useColorScheme();
  const dark = workspace.themePreference === 'dark' || (workspace.themePreference === 'system' && systemScheme !== 'light');
  const colors = dark ? palettes.dark : palettes.light;
  const [destination, setDestination] = useState<Destination>('work');
  const [drawer, setDrawer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const session = destination === 'work' ? workspace.sessions.find(item => item.id === workspace.selectedSessionId) : undefined;
  useEffect(() => { if (workspace.selectedSessionId) setDestination('work'); }, [workspace.selectedSessionId]);
  const start = (projectId?: string) => {
    setInitialProjectId(projectId);
    if (workspace.status === 'connected') setNewSession(true); else setConnect(true);
  };
  return <ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        {session ? <IconButton icon="arrow-back" label="Back to work" onPress={() => workspace.actions.selectSession(null)} /> :
          <IconButton icon="menu-outline" label="Open navigation menu" onPress={() => setDrawer(true)} />}
        <View style={s.heading}><Text numberOfLines={2} accessibilityRole="header"
          style={[s.brand, { color: colors.text }, session && s.sessionTitle]}>{session?.title ?? 'Vibyra'}</Text>
          {!session && workspace.status === 'connected' && <View style={s.connection}>
            <View style={[s.dot, { backgroundColor: colors.success }]} /><Text numberOfLines={1}
              style={[s.computer, { color: colors.muted }]}>{workspace.host?.name ?? 'Connected'}</Text></View>}
        </View>
        <IconButton icon={workspace.status === 'connected' ? 'create-outline' : 'scan-outline'}
          label={workspace.status === 'connected' ? 'Start new work' : 'Connect a computer'} onPress={() => start()} />
      </View>
      <View style={s.body}>
        {destination === 'work' && (session ? <SessionScreen key={session.id} session={session} workspace={workspace} /> :
          <WorkScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={() => start()} />)}
        {destination === 'projects' && <ProjectsScreen workspace={workspace} onConnect={() => setConnect(true)} onNew={start} />}
        {destination === 'computers' && <ComputersScreen workspace={workspace} onConnect={() => setConnect(true)} />}
        {destination === 'settings' && <SettingsScreen workspace={workspace} />}
      </View>
      <NavigationDrawer visible={drawer} destination={destination} workspace={workspace}
        onClose={() => setDrawer(false)} onNavigate={setDestination} />
      <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
      <NewSessionSheet visible={newSession} workspace={workspace} initialProjectId={initialProjectId} onClose={() => setNewSession(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, body: { flex: 1 }, header: { minHeight: 61, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 12, paddingVertical: 5 }, heading: { flex: 1, alignItems: 'center', gap: 4 },
  brand: { fontSize: 21, fontWeight: '600', letterSpacing: -0.7, textAlign: 'center' }, sessionTitle: { fontSize: 16, letterSpacing: -0.2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 5, height: 5, borderRadius: 3 },
  computer: { fontSize: 10, maxWidth: 200 },
});
