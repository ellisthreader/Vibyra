import React, { useState } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { ProjectsScreen } from '../src/ui/ProjectsScreen';
import { projects, sessions } from '../src/demo/data';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

// The Projects page on its own, with the sample computer's folders and terminals.
// `many=1` adds enough folders to raise the search field, which is the only way
// to reach a terminal inside a project that is still closed. `watching=1` is a
// paired Vibyra Desktop: the same folders, and nothing offered that it refuses.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const extra = query.get('many') === '1'
  ? [{ id: 'demo-atlas', name: 'Atlas', path: '~/Projects/atlas', branch: 'main' },
    { id: 'demo-harbor', name: 'Harbor', path: '~/Projects/harbor' }] : [];

function Fixture() {
  const [selected, setSelected] = useState<string | null>(null);
  const workspace: WorkspaceModel = { ...fixtureWorkspace, host: { id: 'demo-mac', name: 'Studio Mac', platform: 'macos' },
    projects: [...projects, ...extra], sessions, selectedSessionId: selected,
    viewOnly: query.get('watching') === '1' };
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
        <ProjectsScreen workspace={workspace} onConnect={() => {}}
          onNew={id => { (window as unknown as { newIn?: string }).newIn = id; }}
          onOpenSession={id => { (window as unknown as { opened?: string }).opened = id; setSelected(id); }} />
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
