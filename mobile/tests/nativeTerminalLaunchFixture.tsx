import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TerminalLaunchFixture } from './terminalLaunchFixture';
function NativeLaunchFixture() { return <SafeAreaProvider><TerminalLaunchFixture /></SafeAreaProvider>; }
registerRootComponent(NativeLaunchFixture);
