import { VibesProvider } from '../src/vibes/VibesProvider';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { useColorScheme } from 'react-native';
function NativeRedesignFixture() {
  const theme = useColorScheme() === 'light' ? 'light' : 'dark';
  const workspace = useDemoWorkspace({ themePreference: theme, setTheme: () => {}, exitDemo: () => {} });
  return <SafeAreaProvider><VibesProvider api={sampleVibesApi} identity="redesign-fixture" purchases={null}><WorkspaceApp workspace={workspace} accountWorkspace={{...workspace,demo:false,account:null}} vibesEnabled /></VibesProvider></SafeAreaProvider>;
}
registerRootComponent(NativeRedesignFixture);
