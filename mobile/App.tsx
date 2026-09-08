import { useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDemoWorkspace } from './src/demo/useDemoWorkspace';
import { useWorkspace } from './src/state/useWorkspace';
import { RuntimeBridge } from './src/transport/RuntimeBridge';
import { WorkspaceApp } from './src/ui/WorkspaceApp';

export default function App() {
  const runtime = useWorkspace();
  const [demo, setDemo] = useState(() => Platform.OS === 'web' && typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('demo') === '1');
  const sample = useDemoWorkspace({ themePreference: runtime.workspace.themePreference,
    setTheme: runtime.workspace.actions.setTheme, exitDemo: () => setDemo(false) });
  const workspace = demo ? sample : { ...runtime.workspace, actions: { ...runtime.workspace.actions,
    enterDemo: () => { runtime.workspace.actions.disconnect(); setDemo(true); } } };
  return <SafeAreaProvider>
    <RuntimeBridge ref={runtime.bridge} onMessage={runtime.onMessage} />
    <WorkspaceApp workspace={workspace} />
  </SafeAreaProvider>;
}
