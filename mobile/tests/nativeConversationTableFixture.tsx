import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationTableFixture } from './conversationTableFixture';
function NativeTableFixture() { return <SafeAreaProvider><ConversationTableFixture /></SafeAreaProvider>; }
registerRootComponent(NativeTableFixture);
