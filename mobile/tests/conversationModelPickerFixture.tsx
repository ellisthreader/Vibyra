import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Pressable, Text, View } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { conversationViewMemory } from '../src/conversation/viewMemory';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';
import { VibesProvider, useVibes } from '../src/vibes/VibesProvider';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { openPhoneChat } from '../src/vibes/openPhoneChat';

const query = new URLSearchParams(location.search), dark = query.get('theme') !== 'light';
const models = ['account-one', 'account-two', 'account-three', 'account-four', 'account-latest'].map((model, index) => ({
  model, displayName: `Account model ${index + 1}`, defaultReasoningEffort: 'high',
  supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }],
}));
const calls: unknown[] = [];
const reads: string[] = []; const phoneCalls: string[] = [];
const api = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, paidAvailable: query.has('paid') ? 10 : 0 }),
  createChat: async () => { phoneCalls.push('create'); return []; }, submit: async () => { throw new Error('Picking a model must not submit'); } };
let settle: (ok: boolean) => void = () => {};
Object.assign(window, { pickerCalls: calls, pickerReads: reads, phoneCalls, settlePicker: (ok: boolean) => settle(ok) });
conversationViewMemory('fixture-host:fixture-conversation').attachments = [{ id: 'kept-image', name: 'Draft image', mime: 'image/png', hash: 'fixture-hash', complete: true }];
function Fixture() {
  const { store, model: phoneModel } = useVibes(); const [phone, setPhone] = useState(false);
  const [settings, setSettings] = useState({ provider: query.get('provider') ?? 'codex', model: models[0]!.model, effort: 'high', revision: 7, approvalPolicy: 'on-request', appliesTo: 'nextTurn' });
  const workspace: WorkspaceModel = { ...fixtureWorkspace,
    conversation: { ...fixtureWorkspace.conversation!, settings, processState: query.has('saved') ? 'interrupted' : 'running', turnState: 'idle', items: fixtureWorkspace.conversation!.items.slice(0, 2) },
    actions: { ...fixtureWorkspace.actions,
      conversationRequest: async <T,>(method: string) => {
        reads.push(method);
        if (query.has('saved') || query.has('provider-stopped')) throw new Error('Live provider data is unavailable for this saved conversation');
        return { models } as T;
      },
      setConversationSettings: async (model, effort, revision) => {
        calls.push({ model, effort, revision });
        const ok = await new Promise<boolean>(resolve => { settle = resolve; });
        if (!ok) throw new Error('Settings changed on the computer');
        setSettings(value => ({ ...value, model, effort, revision: value.revision + 1 }));
      },
    },
  };
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
      {phone ? <View><Text>{`Phone chat opened: ${phoneModel}`}</Text><Pressable accessibilityRole="button" onPress={() => setPhone(false)}><Text>Return to saved conversation</Text></Pressable></View>
        : <ConversationSessionScreen session={fixtureSession} workspace={workspace} options={false} onCloseOptions={() => {}}
          onPhoneChat={query.has('phone') ? model => openPhoneChat(store, model, () => setPhone(true)) : undefined} />}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<VibesProvider api={api} identity="picker-fixture" purchases={null}><Fixture /></VibesProvider>);
