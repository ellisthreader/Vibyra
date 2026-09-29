import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { conversationViewMemory } from '../src/conversation/viewMemory';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';

const query = new URLSearchParams(location.search), dark = query.get('theme') !== 'light';
const models = ['account-one', 'account-two', 'account-three', 'account-four', 'account-latest'].map((model, index) => ({
  model, displayName: `Account model ${index + 1}`, defaultReasoningEffort: 'high',
  supportedReasoningEfforts: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })),
}));
const calls: unknown[] = [];
const reads: string[] = []; const phoneCalls: string[] = [];
const api = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, paidAvailable: query.has('paid') ? 10 : 0 }),
  quote: async (...args: Parameters<typeof sampleVibesApi.quote>) => { phoneCalls.push('quote'); return sampleVibesApi.quote(...args); },
  createChat: async () => { phoneCalls.push('create'); return []; }, submit: async () => { throw new Error('Picking a model must not submit'); } };
let settle: (ok: boolean) => void = () => {};
let settleSend: () => void = () => {};
Object.assign(window, { pickerCalls: calls, pickerReads: reads, phoneCalls, settlePicker: (ok: boolean) => settle(ok) });
Object.assign(window, { settleSend: () => settleSend() });
conversationViewMemory('fixture-host:fixture-conversation').attachments = [{ id: 'kept-image', name: 'Draft image', mime: 'image/png', hash: 'fixture-hash', complete: true }];
function Fixture() {
  const [selected, setSelected] = useState<string | null>(query.has('home') ? null : fixtureSession.id);
  const [projects, setProjects] = useState(fixtureWorkspace.projects);
  Object.assign(window, { removeProject: () => setProjects([]) });
  const [settings, setSettings] = useState({ provider: query.get('provider') ?? 'codex', model: models[0]!.model, effort: 'high', revision: 7, approvalPolicy: 'on-request', appliesTo: 'nextTurn' });
  const workspace: WorkspaceModel = { ...fixtureWorkspace, projects, selectedSessionId: selected,
    themePreference: dark ? 'dark' : 'light',
    conversation: { ...fixtureWorkspace.conversation!, settings, sessionId: query.has('mismatch') ? 'another-terminal' : fixtureSession.id, processState: query.has('saved') ? 'interrupted' : 'running', turnState: 'idle', items: fixtureWorkspace.conversation!.items.slice(0, 2) },
    actions: { ...fixtureWorkspace.actions, selectSession: setSelected,
      conversationRequest: async <T,>(method: string) => {
        reads.push(method);
        if (method === 'conversation.commands') return { version: 1, commands: [
          { name: 'effort', description: 'Set effort', scope: 'settings', aliases: [], available: true },
        ], unsupported: [] } as T;
        if (query.has('saved') || query.has('provider-stopped')) throw new Error('Live provider data is unavailable for this saved conversation');
        return { models: query.has('empty-models') ? [] : models } as T;
      },
      submitTurn: async () => { await new Promise<void>(resolve => { settleSend = resolve; }); },
      setConversationSettings: async (model, effort, revision) => {
        calls.push({ model, effort, revision });
        const ok = await new Promise<boolean>(resolve => { settle = resolve; });
        if (!ok) throw new Error('Settings changed on the computer');
        setSettings(value => ({ ...value, model, effort, revision: value.revision + 1 }));
      },
    },
  };
  if (query.has('workspace')) return <SafeAreaProvider><WorkspaceApp workspace={workspace} vibesEnabled /></SafeAreaProvider>;
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
      <ConversationSessionScreen session={fixtureSession} workspace={workspace} options={false} onCloseOptions={() => {}} />
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<VibesProvider api={api} identity="picker-fixture" purchases={null}><Fixture /></VibesProvider>);
