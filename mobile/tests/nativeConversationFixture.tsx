import React from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';

function NativeFixture() {
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#101115' }}>
    <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text style={{ color: palettes.dark.text, fontSize: 18, fontWeight: '600' }}>Welcome screen</Text>
        <Text style={{ color: palettes.dark.muted, fontSize: 12 }}>Native conversation fixture</Text>
      </View>
      <ConversationSessionScreen session={fixtureSession} workspace={fixtureWorkspace} />
    </ThemeContext.Provider>
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(NativeFixture);
