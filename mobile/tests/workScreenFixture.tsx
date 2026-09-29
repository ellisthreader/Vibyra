import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { ProductModeSwitch } from '../src/agents/ProductMode';
import { AppHeader } from '../src/ui/AppHeader';
import { WorkScreen } from '../src/ui/WorkScreen';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

// Code home stays non-editable on every connection state.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const connected = query.has('connected');
const empty = query.has('empty');
const remembered = query.has('remembered');
const viewOnly = query.has('viewOnly');
const noAgents = query.has('noAgents');

function Fixture() {
  const colors = dark ? palettes.dark : palettes.light;
  const openProjects = () => { Object.assign(window, { projectsOpened: true }); };
  const workspace: WorkspaceModel = { ...fixtureWorkspace, status: connected ? 'connected' : 'offline',
    projects: empty ? [] : fixtureWorkspace.projects, viewOnly,
    remembered: remembered ? { projects: fixtureWorkspace.projects, seenAt: '2026-09-28T10:00:00Z' } : null };
  return <ThemeContext.Provider value={{ colors, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <VibesProvider api={sampleVibesApi} identity={null} purchases={null}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ height: 24 }} />
          <AppHeader destination="work" workspace={workspace} session={undefined} connected={connected}
            compact={false} onMenu={openProjects} onSwitchChat={openProjects} onComputers={() => {}}
            modeSwitch={noAgents ? undefined : <ProductModeSwitch mode="work" onChange={() => {}} />} />
          <View style={{ flex: 1 }}>
            <WorkScreen workspace={workspace} connected={connected}
              onProjects={openProjects}
              onNewProject={() => { Object.assign(window, { newProjectOpened: true }); }}
              onConnect={() => { Object.assign(window, { connectOpened: true }); }}
              onAgents={noAgents ? undefined : () => { Object.assign(window, { agentsOpened: true }); }} />
          </View>
          <View style={{ height: 24 }} />
        </View>
      </VibesProvider>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
