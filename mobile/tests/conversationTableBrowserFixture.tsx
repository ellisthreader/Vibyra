import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationTableFixture } from './conversationTableFixture';
createRoot(document.getElementById('root')!).render(<SafeAreaProvider>
  <ConversationTableFixture initialDark={new URLSearchParams(location.search).get('theme') !== 'light'} />
</SafeAreaProvider>);
