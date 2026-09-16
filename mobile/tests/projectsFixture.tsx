import React from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { ProjectsScreen } from '../src/ui/ProjectsScreen';
import { projects, sessions } from '../src/demo/data';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { Session, WorkspaceModel } from '../src/ui/types';

// The Projects page on its own, with the sample computer's folders and terminals.
// `many=1` adds enough folders to raise the search field, and one holding four
// terminals so the stack shows its cap. `watching=1` is a paired Vibyra Desktop:
// the same folders. `scaffold=1` is a Host that can build a project, which puts
// the New project button. `manage=0` is a computer
// that will not let a phone rename or remove one. `away=1` is the computer
// gone: the page reads from what it was last seen sharing. Tapping a row enters the project; the fixture records which.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const many = query.get('many') === '1';
const extra = many ? [{ id: 'demo-atlas', name: 'Atlas', path: '~/Projects/atlas', branch: 'main' },
  { id: 'demo-harbor', name: 'Harbor', path: '~/Projects/harbor' }] : [];
const older: Session[] = many ? ['Seed the database', 'Try the new router', 'Bump dependencies', 'Profile the build']
  .map((title, index) => ({ id: `harbor-${index}`, projectId: 'demo-harbor', title, kind: 'shell',
    status: index === 0 ? 'interrupted' : 'exited', createdAt: `2026-09-0${index + 1}T09:00:00Z` })) : [];

function Fixture() {
  // The open terminal's project is the one marked with the accent.
  const selected = 'demo-terminal';
  const workspace: WorkspaceModel = { ...fixtureWorkspace, host: { id: 'demo-mac', name: 'Studio Mac', platform: 'macos' },
    projects: [...projects, ...extra], sessions: [...sessions, ...older], selectedSessionId: selected,
    viewOnly: query.get('watching') === '1', scaffoldAvailable: query.get('scaffold') === '1',
    canManage: query.get('manage') !== '0',
    ...(query.get('away') === '1'
      ? { status: 'offline' as const, projects: [],
        remembered: { projects: [...projects, ...extra], seenAt: new Date(Date.now() - 3 * 3600_000).toISOString() } }
      : {}),
    actions: { ...fixtureWorkspace.actions,
      ...(query.get('manage') === '0' ? {} : {
        renameProject: async (projectId: string, name: string) => {
          (window as unknown as { renamed?: string[] }).renamed = [projectId, name];
        },
        forgetProject: async (projectId: string) => {
          (window as unknown as { forgot?: string }).forgot = projectId;
        },
      }) } };
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
        <ProjectsScreen workspace={workspace} onConnect={() => {}} onNew={() => { (window as unknown as { opened?: string }).opened = 'new'; }}
          onOpen={id => { (window as unknown as { opened?: string }).opened = id; }} />
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
