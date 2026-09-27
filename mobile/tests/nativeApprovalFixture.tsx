import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { findPrompt } from '../src/terminal/promptChoices';
import { TerminalPromptBar } from '../src/ui/TerminalPromptBar';
import { ConversationApprovalDock } from '../src/conversation/ConversationApprovalDock';
import { presentConversation } from '../src/state/presentConversation';

const screen = [
  'Would you like to run the following command?',
  'Environment: local',
  'Reason: Let your iPhone open the website?',
  '$ HKE_ALLOW_LAN=1 npm run start:website',
  '› 1. Yes, proceed (y)',
  "  2. Yes, and don't ask again for this command (p)",
  '  3. No, and tell Codex what to do differently (esc)',
];
const prompt = findPrompt(screen)!;
const permission = presentConversation([{ id: 'approval', turnId: 'turn', kind: 'permission',
  status: 'pending', title: 'Allow this command?', text: 'Let your iPhone open the website?',
  detail: 'Environment: local\nHKE_ALLOW_LAN=1 npm run start:website\n\nRequested access: network access to all destinations for this command',
  choices: ['decline', 'accept', 'acceptWithExecpolicyAmendment'],
  ruleSummary: 'Codex will remember these exact command-prefix tokens: ["HKE_ALLOW_LAN=1","npm","run","start:website"]. Future matching commands may run without asking.' }])[0];

function NativeApprovalFixture() {
  const [mode, setMode] = useState<'terminal' | 'chat'>('terminal');
  const [round, setRound] = useState(0);
  const [decision, setDecision] = useState('none');
  const colors = palettes.dark;
  const reset = () => { setRound(value => value + 1); setDecision('none'); };
  return <ThemeContext.Provider value={{ colors, dark: true }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 12 }}>
      <View style={{ flexDirection: 'row', gap: 14, padding: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Terminal approval" onPress={() => { setMode('terminal'); reset(); }}>
          <Text style={{ color: colors.text }}>Terminal</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Shared chat approval" onPress={() => { setMode('chat'); reset(); }}>
          <Text style={{ color: colors.text }}>Shared chat</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset approval" onPress={reset}>
          <Text style={{ color: colors.text }}>Reset</Text>
        </Pressable>
      </View>
      <Text accessibilityLabel={`Selected approval: ${decision}`} style={{ color: colors.text, padding: 12 }}>Selected approval: {decision}</Text>
      {mode === 'terminal' ? <>
        <View style={{ flex: 1, padding: 12 }}><Text style={{ color: colors.muted }}>{screen.join('\n')}</Text></View>
        <TerminalPromptBar key={round} prompt={prompt} onChoose={async keys => setDecision(JSON.stringify(keys))} />
      </> : <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {permission?.kind === 'permission' && <ConversationApprovalDock key={round} item={permission} canRespond
          onDecision={async (_id, choice) => setDecision(choice)} />}
        <View style={{ height: 100, padding: 20, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.muted }}>Message…</Text>
        </View>
      </View>}
    </SafeAreaView>
  </ThemeContext.Provider>;
}
registerRootComponent(NativeApprovalFixture);
