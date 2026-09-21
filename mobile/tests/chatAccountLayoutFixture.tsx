import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { writeFlag } from '../src/transport/deviceFlags';
import { VibesProvider, useVibes } from '../src/vibes/VibesProvider';
import { VibesScreen } from '../src/vibes/VibesScreen';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import type { VibesApi, VibesModel, VibesTurn } from '../src/vibes/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const dark = new URLSearchParams(location.search).get('theme') !== 'light';
const colors = dark ? palettes.dark : palettes.light;
const email = 'signed-in-chat@example.test';
let signedIn = false;
const sent: unknown[] = [];
const turns: VibesTurn[] = [];
const models: VibesModel[] = [
  { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', family: 'OpenAI', available: true, trial: true,
    inputPerMillion: 0.2, outputPerMillion: 1.2, reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', mandatory: false } },
  { id: 'qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', family: 'Qwen', available: true, trial: true,
    inputPerMillion: 0.1, outputPerMillion: 0.2, reasoning: { efforts: [], defaultEffort: null, mandatory: false } },
];
const api: VibesApi = {
  ...sampleVibesApi,
  guest: { restore() {}, create: async () => ({ token: 'fixture-only', wallet: { ...sampleWallet, guest: true } }) },
  wallet: async () => ({ ...sampleWallet, guest: !signedIn, verified: signedIn, consented: true }),
  models: async () => models,
  quote: async (chatId, text, model, effort) => ({ quote: JSON.stringify({ chatId, text, model, effort }),
    maxCredits: 1, estimatedCredits: 1, model, effort, expiresAt: Date.now() / 1000 + 120 }),
  submit: async (id, quote) => {
    const q = JSON.parse(quote); sent.push({ ...q, signedIn });
    const turn: VibesTurn = { id, chatId: q.chatId, model: q.model, prompt: q.text, response: 'Signed-in reply verified.',
      status: 'completed', reserved: 1, charged: 1, error: null, createdAt: new Date().toISOString() };
    turns.push(turn); return turn;
  },
  turn: async id => turns.find(turn => turn.id === id)!,
  turns: async id => turns.filter(turn => turn.chatId === id),
};
function Chat({ account }: { account: typeof fixtureWorkspace.account }) {
  const { store, ready } = useVibes();
  Object.assign(window, { accountChat: { store, ready, sent } });
  return <VibesScreen workspace={{ ...fixtureWorkspace, account }} onWallet={() => { throw new Error('Unexpected wallet navigation'); }} />;
}
function Harness() {
  const [account, setAccount] = useState<typeof fixtureWorkspace.account>(null);
  const signIn = async () => {
    await writeFlag(`vibes.${encodeURIComponent(email)}`, JSON.stringify({ model: 'openai/gpt-5.6-luna', effort: 'high' }));
    signedIn = true; setAccount({ name: 'Signed-in account', email, plan: 'free' });
  };
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable accessibilityRole="button" onPress={() => void signIn()} style={{ minHeight: 44 }}>
        <Text style={{ color: colors.text }}>{account ? 'Signed-in account fixture' : 'Sign in test account'}</Text>
      </Pressable>
      <VibesProvider api={api} identity={account?.email ?? null} guest purchases={null}>
        <Chat account={account} />
      </VibesProvider>
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
