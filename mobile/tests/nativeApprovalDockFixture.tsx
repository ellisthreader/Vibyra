import { useEffect } from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';

const workspace = {
  ...fixtureWorkspace,
  conversation: {
    ...fixtureWorkspace.conversation!,
    items: fixtureWorkspace.conversation!.items.map(item => item.id === 'permission' && item.kind === 'permission'
      ? { ...item, title: 'Allow this command?',
        detail: "Environment: local\n/bin/zsh -lc 'npm run dev -- --host 127.0.0.1 --port 5175'",
        choices: ['accept', 'acceptWithExecpolicyAmendment', 'decline'],
        ruleSummary: 'Codex will remember these exact command-prefix tokens: ["npm","run","dev","--","--host","127.0.0.1","--port","5175"]. Future matching commands may run without asking.' }
      : item),
  },
};

function NativeApprovalDockFixture() {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palettes.dark : palettes.light;
  useEffect(() => {
    const barStyle = dark ? 'light-content' : 'dark-content';
    const entry = StatusBar.pushStackEntry({ barStyle, animated: false });
    // The development launcher can reset the bar during its closing animation.
    const timer = setTimeout(() => StatusBar.setBarStyle(barStyle, false), 900);
    return () => { clearTimeout(timer); StatusBar.popStackEntry(entry); };
  }, [dark]);
  return <ThemeContext.Provider value={{ dark, colors }}>
    <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.workspace }}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Welcome screen</Text>
      </View>
      <ConversationSessionScreen session={fixtureSession} workspace={workspace} options={false} onCloseOptions={() => {}} />
    </SafeAreaView></SafeAreaProvider>
  </ThemeContext.Provider>;
}

registerRootComponent(NativeApprovalDockFixture);
