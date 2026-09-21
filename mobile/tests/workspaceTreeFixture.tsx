import { useFonts } from 'expo-font';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import { ThemeContext, palettes } from '../src/theme';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
function Fixture() {
  useFonts({ 'DM Sans': require('../assets/fonts/DMSans.ttf') });
  const dark = new URLSearchParams(location.search).get('theme') !== 'light';
  const workspace = useDemoWorkspace({ themePreference: dark ? 'dark' : 'light', setTheme: () => {}, exitDemo: () => {} });
  const [projectId, setProjectId] = useState<string | null>(null);
  return <SafeAreaProvider><ThemeContext.Provider value={{ dark, colors: dark ? palettes.dark : palettes.light }}>
    <NavigationDrawer visible destination="work" workspace={workspace} currentProjectId={projectId}
      project={workspace.projects.find(p => p.id === projectId)} onEnterProject={setProjectId}
      onClose={() => {}} onNew={() => {}} onNavigate={() => {}} />
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
