import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TerminalLaunchFixture } from './terminalLaunchFixture';
const access = new URLSearchParams(location.search).get('access') as 'watch' | 'offline' | null;
createRoot(document.getElementById('root')!).render(<SafeAreaProvider><TerminalLaunchFixture access={access ?? 'manage'} /></SafeAreaProvider>);
