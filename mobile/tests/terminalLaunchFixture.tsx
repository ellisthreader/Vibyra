import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import { NewSessionSheet } from '../src/ui/NewSessionSheet';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { Session, WorkspaceModel } from '../src/ui/types';

export function TerminalLaunchFixture({ access = 'manage' }: { access?: 'manage' | 'watch' | 'offline' }) {
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sessions, setSessions] = useState<Session[]>(access === 'manage' ? [] : [{ ...fixtureSession, readOnly: true }]);
  const [selected, setSelected] = useState<Session>();
  const [failed, setFailed] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [closed, setClosed] = useState<string[]>([]);
  const project = fixtureWorkspace.projects[0];
  const workspace: WorkspaceModel = { ...fixtureWorkspace, sessions, selectedSessionId: selected?.id ?? null,
    status: access === 'offline' ? 'disconnected' : 'connected', viewOnly: access !== 'manage', canManage: access !== 'watch',
    actions: { ...fixtureWorkspace.actions,
      selectSession: id => setSelected(sessions.find(item => item.id === id)),
      stopSession: async id => { setClosed(old => [...old, id]); setSessions(old => old.map(item => item.id === id ? { ...item, status: 'exited' } : item)); },
      createSession: async (projectId, kind, title) => {
      setAttempts(value => value + 1);
      if (failed) { setFailed(false); throw new Error('The computer could not start this terminal. Try again.'); }
      const session: Session = { id: `created-${sessions.length}`, projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
      setSessions(old => [...old, session]); setSelected(session); return session;
    } },
  };
  return <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.background }}>
      <View style={{ padding: 20, gap: 20 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open project menu" onPress={() => setDrawer(true)} style={{ minHeight: 44 }}>
          <Text style={{ color: palettes.dark.text }}>Open project menu</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Fail next creation" onPress={() => setFailed(true)} style={{ minHeight: 44 }}>
          <Text style={{ color: palettes.dark.text }}>Fail next creation</Text></Pressable>
        <Text style={{ color: palettes.dark.text }}>{selected ? `Opened ${selected.title} in ${project.name}` : 'No terminal selected'}</Text>
        <Text style={{ color: palettes.dark.muted }}>{`Created ${sessions.length} terminals · ${attempts} attempts`}</Text>
        <Text style={{ color: palettes.dark.muted }}>{`Closed ${closed.length} terminals`}</Text>
      </View>
      <NavigationDrawer visible={drawer} destination="work" workspace={workspace} project={project}
        onClose={() => setDrawer(false)} onNavigate={() => {}} onNew={() => {}}
        onNewTerminal={() => setPicker(true)} />
      <NewSessionSheet visible={picker} initialProjectId={project.id} workspace={workspace} onClose={() => setPicker(false)} />
    </SafeAreaView>
  </ThemeContext.Provider>;
}
