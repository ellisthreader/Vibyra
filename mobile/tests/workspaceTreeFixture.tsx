import { useFonts } from 'expo-font';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import { ThemeContext, palettes } from '../src/theme';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import { useProjectNavigation } from '../src/ui/useProjectNavigation';
function Fixture() {
  useFonts({ 'DM Sans': require('../assets/fonts/DMSans.ttf') });
  const dark = new URLSearchParams(location.search).get('theme') !== 'light';
  const workspace = useDemoWorkspace({ account: null, themePreference: dark ? 'dark' : 'light', setTheme: () => {}, exitDemo: () => {} });
  const many = new URLSearchParams(location.search).has('many');
  const dropSelection = new URLSearchParams(location.search).has('drop');
  const failDelete = new URLSearchParams(location.search).has('failDelete');
  const projects = many ? [...workspace.projects,
    ...Array.from({ length: 10 }, (_, index) => ({ id: `extra-${index + 1}`,
      name: `Project ${index + 1}`, path: `~/Projects/extra-${index + 1}` }))] : workspace.projects;
  const shownWorkspace = { ...workspace, projects, actions: { ...workspace.actions,
    renameProject: async () => {}, forgetProject: async () => {},
    stopSession: failDelete ? async () => { throw new Error('The Mac could not delete this terminal.'); } : workspace.actions.stopSession,
    selectSession: (id: string | null) => workspace.actions.selectSession(dropSelection && id ? null : id) } };
  const nav = useProjectNavigation(shownWorkspace, null);
  const projectId = nav.projectId;
  return <SafeAreaProvider><ThemeContext.Provider value={{ dark, colors: dark ? palettes.dark : palettes.light }}>
    <NavigationDrawer visible destination="work" workspace={shownWorkspace} currentProjectId={projectId}
      project={shownWorkspace.projects.find(p => p.id === projectId)} onEnterProject={nav.enterProject}
      onOpenSession={nav.openSession}
      onClose={() => {}} onNew={() => {}} onNavigate={() => {}} onReport={() => {}} />
    <span data-testid="selected-session">{shownWorkspace.selectedSessionId ?? ''}</span>
    <span data-testid="focused-session">{nav.focusedSessionId ?? ''}</span>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
