import { useRef, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { ThemeContext, palettes } from '../src/theme';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

// Native controls only: no account, network pairing or model inference.
const models = ['one', 'two'].map((id) => ({
  model: `qa-${id}`,
  displayName: `QA model ${id}`,
  defaultReasoningEffort: 'high',
  supportedReasoningEfforts: ['low', 'medium', 'high'].map((reasoningEffort) => ({
    reasoningEffort,
    description: reasoningEffort,
  })),
}));
function NativeTerminalControlsFixture() {
  const [settings, setSettings] = useState({
    provider: 'codex',
    model: 'qa-one',
    effort: 'high',
    revision: 1,
    approvalPolicy: 'on-request',
    appliesTo: 'nextTurn',
  });
  const [receipt, setReceipt] = useState('No settings changed');
  const refuse = useRef(false);
  const workspace: WorkspaceModel = {
    ...fixtureWorkspace,
    conversation: { ...fixtureWorkspace.conversation!, settings, turnState: 'idle', items: [] },
    actions: {
      ...fixtureWorkspace.actions,
      conversationRequest: async <T,>() => ({ models }) as T,
      setConversationSettings: async (model, effort, revision) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (refuse.current) {
          refuse.current = false;
          throw new Error('Fixture settings refused');
        }
        if (revision !== settings.revision) throw new Error('Fixture revision mismatch');
        setSettings((value) => ({ ...value, model, effort, revision: revision + 1 }));
        setReceipt(`Confirmed ${model} ${effort} revision ${revision + 1}`);
      },
      submitTurn: async (text) => {
        setReceipt(`Sent fixture message: ${text}`);
      },
    },
  };
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.background }}>
          <View style={{ padding: 12, gap: 4 }}>
            <Text style={{ color: palettes.dark.text }}>{receipt}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refuse next settings change"
              style={{ minHeight: 44, justifyContent: 'center' }}
              onPress={() => {
                refuse.current = true;
              }}
            >
              <Text style={{ color: palettes.dark.accent }}>Refuse next settings change</Text>
            </Pressable>
          </View>
          <ConversationSessionScreen
            session={fixtureSession}
            workspace={workspace}
            options={false}
            onCloseOptions={() => {}}
          />
        </SafeAreaView>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}
registerRootComponent(NativeTerminalControlsFixture);
