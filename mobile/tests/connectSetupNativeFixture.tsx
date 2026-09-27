import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionModal } from '../src/connection/ConnectionModal';
import { ConnectSetup } from '../src/connection/ConnectSetup';
import { palettes, ThemeContext } from '../src/theme';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// Isolated layout/keyboard preview; email delivery is mocked and never leaves the device.
function Fixture() {
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(true);
  const colors = palettes[dark ? 'dark' : 'light'];
  const workspace = { ...fixtureWorkspace, host: null,
    actions: { ...fixtureWorkspace.actions, sendHostLink: async (email?: string) => email ?? 'preview@example.com' } };
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <Pressable accessibilityRole="button" onPress={() => setDark(value => !value)}><Text style={{ color: colors.text }}>Toggle theme</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}><Text style={{ color: colors.text }}>Open setup</Text></Pressable>
      {open && <ConnectionModal onClose={() => setOpen(false)}>{dismiss =>
        <ConnectSetup workspace={workspace} onInstalled={dismiss} onCloud={() => {}} />
      }</ConnectionModal>}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(Fixture);
