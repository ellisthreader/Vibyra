import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneKeyboardFixture } from './phoneKeyboardFixture';
createRoot(document.getElementById('root')!).render(<SafeAreaProvider><PhoneKeyboardFixture /></SafeAreaProvider>);
