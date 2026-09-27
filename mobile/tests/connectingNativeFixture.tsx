import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionModal } from '../src/connection/ConnectionModal';
import { ConnectingStep } from '../src/connection/ConnectingStep';
import { palettes, ThemeContext } from '../src/theme';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// Real approval UI with a pending mock handshake; no computer or saved state is touched.
function Fixture() {
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(true);
  const colors = palettes[dark ? 'dark' : 'light'];
  const workspace = { ...fixtureWorkspace, status: 'pairing' as const, host: null,
    actions: { ...fixtureWorkspace.actions, connect: () => new Promise<void>(() => {}), disconnect: () => {} } };
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <Pressable accessibilityRole="button" onPress={() => setDark(value => !value)}><Text style={{ color: colors.text }}>Toggle theme</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}><Text style={{ color: colors.text }}>Open approval</Text></Pressable>
      {open && <ConnectionModal onClose={() => setOpen(false)}>{dismiss =>
        <ConnectingStep workspace={workspace} computer={{ id: 'fixture', name: 'Ellis’s MacBook',
          hostId: 'ab'.repeat(32), host: '127.0.0.1', port: 4318 }} onDone={dismiss} onSearch={dismiss} />
      }</ConnectionModal>}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(Fixture);
