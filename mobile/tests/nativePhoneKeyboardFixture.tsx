import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneKeyboardFixture } from './phoneKeyboardFixture';
function Fixture() { return <SafeAreaProvider><PhoneKeyboardFixture /></SafeAreaProvider>; }
registerRootComponent(Fixture);
