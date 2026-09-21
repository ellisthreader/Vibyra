import { useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import { generationItems, type GenerationStage } from './generationFixtureData';

export function GenerationFixture({ initialStage = 'working', initialDark = true }: { initialStage?: GenerationStage; initialDark?: boolean }) {
  const [stage, setStage] = useState(initialStage);
  const [dark, setDark] = useState(initialDark);
  const [sent, setSent] = useState(0);
  const colors = dark ? palettes.dark : palettes.light;
  const Frame = Platform.OS === 'ios' ? SafeAreaView : View;
  const working = ['thinking', 'working', 'streaming', 'offline'].includes(stage);
  const workspace = { ...fixtureWorkspace, themePreference: dark ? 'dark' as const : 'light' as const,
    status: stage === 'offline' ? 'disconnected' as const : 'connected' as const,
    conversation: { ...fixtureWorkspace.conversation!, items: generationItems(stage), turnId: 'generation-turn',
      turnState: working ? 'running' as const : stage === 'waiting' ? 'waiting' as const : stage === 'stopped' ? 'interrupted' as const : 'completed' as const },
    actions: { ...fixtureWorkspace.actions, submitTurn: async () => { setSent(n => n + 1); setStage('thinking'); },
      interruptTurn: async () => { setStage('stopped'); }, resolveDecision: async () => { setStage('working'); } },
  };
  return <ThemeContext.Provider value={{ colors, dark }}><Frame style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
    <View style={{ paddingHorizontal: 20, height: 64 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Welcome screen</Text>
        <Text style={{ color: colors.muted, fontSize: 10 }}>Generation design fixture · sent {sent}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={() => setDark(!dark)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{dark ? 'Light' : 'Dark'}</Text></Pressable>
        {(['thinking', 'working', 'streaming', 'completed', 'stopped', 'offline', 'waiting'] as const).map(value =>
          <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Show ${value}`} onPress={() => setStage(value)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: stage === value ? colors.text : colors.muted, fontSize: 12 }}>{value}</Text></Pressable>)}
      </ScrollView>
    </View>
    <ConversationSessionScreen session={fixtureSession} workspace={workspace} />
  </Frame></ThemeContext.Provider>;
}
