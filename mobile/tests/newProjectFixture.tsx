import { useState } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { sampleScaffold } from '../src/demo/sampleScaffold';
import { projects, sessions } from '../src/demo/data';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import { NewProjectSheet } from '../src/ui/newProject/NewProjectSheet';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { Project, WorkspaceModel } from '../src/ui/types';

// The rail's home face with a computer that can build a project, and the New
// project sheet its pinned + Project opens (the rail closes first, as the app's does). The sample computer answers the wizard from timers:
// every tool but Flutter and Rails is present, and a finished build lands in
// the list. `unavailable=1` is a Host without the wizard; `watching=1` a
// paired Desktop. A finished project is recorded on `window.done`.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
Object.assign(window, { done: null, opened: null });

function Fixture() {
  const [folders, setFolders] = useState<Project[]>(projects);
  const [scaffold] = useState(() => sampleScaffold(project => setFolders(current => [...current, project])));
  const [open, setOpen] = useState(query.get('open') === '1');
  const [drawer, setDrawer] = useState(!open);
  const closeSheet = () => { setOpen(false); setDrawer(true); };
  const workspace: WorkspaceModel = { ...fixtureWorkspace, host: { id: 'demo-mac', name: 'Studio Mac', platform: 'macos' },
    projects: folders, sessions, selectedSessionId: null, viewOnly: query.get('watching') === '1',
    scaffoldAvailable: query.get('unavailable') !== '1', actions: { ...fixtureWorkspace.actions, scaffold } };
  const colors = dark ? palettes.dark : palettes.light;
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NavigationDrawer visible={drawer} destination="work" workspace={workspace} currentProjectId="ideas"
          onClose={() => setDrawer(false)} onNavigate={() => {}} onNew={() => {}}
          onNewProject={() => { setDrawer(false); setOpen(true); }} onEnterProject={id => { Object.assign(window, { opened: id }); }} />
        <NewProjectSheet visible={open} workspace={workspace} onClose={closeSheet}
          onDone={(project, openTerminal) => { Object.assign(window, { done: [project.id, project.name, openTerminal] }); closeSheet(); }} />
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
