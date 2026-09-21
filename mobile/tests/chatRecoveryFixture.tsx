import React from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { VibesScreen } from '../src/vibes/VibesScreen';
import { VibesProvider, useVibes } from '../src/vibes/VibesProvider';
import { VibesError } from '../src/vibes/api';
import { preferencesChanged, preferenceRevision } from '../src/vibes/preferenceChanges';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import type { VibesApi, VibesChat, VibesTurn } from '../src/vibes/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const mode = new URLSearchParams(location.search).get('mode');
const dark = new URLSearchParams(location.search).get('theme') !== 'light';
const colors = dark ? palettes.dark : palettes.light;
const chats: VibesChat[] = [{ id: 'other', title: 'Other chat', trial_slot: null, trial_used: 0 }];
const turns: VibesTurn[] = [];
const quotes: { chatId: string; text: string; personal: number; attachments: string[] }[] = [];
const sent: unknown[] = [];
let failQuote = mode === 'retry'; let release = () => {}; let upload = 0;
const api: VibesApi = {
  ...sampleVibesApi, models: async () => [],
  wallet: async () => ({ ...await sampleVibesApi.wallet(), available: 100, consented: true, verified: true, chatEnabled: true }),
  chats: async () => chats,
  createChat: async (id, title) => { chats.push({ id, title, trial_slot: null, trial_used: 0 }); return chats; },
  turns: async id => turns.filter(turn => turn.chatId === id),
  turn: async id => { const turn = turns.find(turn => turn.id === id); if (!turn) throw new VibesError('Missing', 404); return turn; },
  quote: async (chatId, text, model, effort, _integrations, attachments = []) => {
    quotes.push({ chatId, text, personal: preferenceRevision(), attachments });
    if (failQuote) { failQuote = false; throw new VibesError('Estimate interrupted. Please refresh.', 503); }
    return { quote: JSON.stringify({ chatId, text, model, effort, attachments }), model, effort,
      maxCredits: 2, estimatedCredits: 2, expiresAt: Date.now() / 1000 + 120 };
  },
  submit: async (id, quote) => {
    const q = JSON.parse(quote); sent.push(q);
    const turn: VibesTurn = { id, chatId: q.chatId, model: q.model, prompt: q.text, status: 'running',
      response: null, error: null, reserved: 2, charged: 0, createdAt: new Date().toISOString() };
    turns.push(turn);
    await new Promise<void>(resolve => { release = resolve; });
    Object.assign(turn, { status: 'completed', response: 'Your reply arrived.', charged: 1 });
    return turn;
  },
  upload: async source => ({ id: `photo-${++upload}`, name: source.name, bytes: 10, kind: 'text' }),
};
const workspace = { ...fixtureWorkspace, account: { name: 'Chat test', email: 'chat-recovery@example.test', plan: 'free' } };
function Harness() {
  const { store } = useVibes();
  Object.assign(window, { chatTest: { quotes, sent, release: () => release(), store, preferencesChanged } });
  return <>
    <Text style={{ color: colors.muted }}>Isolated mobile Chat test</Text>
    <View style={{ flexDirection: 'row' }}>
      <Pressable accessibilityRole="button" onPress={() => void store.select('other')} style={{ minHeight: 44 }}><Text>Test other chat</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={preferencesChanged} style={{ minHeight: 44 }}><Text>Test changed memory</Text></Pressable>
    </View>
    <VibesScreen workspace={workspace} onWallet={() => { throw new Error('Unexpected wallet redirect'); }} />
  </>;
}
createRoot(document.getElementById('root')!).render(<SafeAreaProvider>
  <ThemeContext.Provider value={{ colors, dark }}><View style={{ flex: 1, backgroundColor: colors.background }}>
    <VibesProvider api={api} identity="chat-recovery@example.test" purchases={null}><Harness /></VibesProvider>
  </View></ThemeContext.Provider>
</SafeAreaProvider>);
