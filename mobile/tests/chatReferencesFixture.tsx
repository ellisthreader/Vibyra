import React, { useState } from 'react';
import { Button, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import { palettes, ThemeContext } from '../src/theme';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import { VibesScreen } from '../src/vibes/VibesScreen';
import { VibesStore } from '../src/vibes/VibesStore';
import { VibesStoreProvider } from '../src/vibes/VibesProvider';
import type { VibesApi, VibesChat, VibesTurn, VibesWallet } from '../src/vibes/types';

const calls: Record<string, unknown>[] = [];
if (typeof window !== 'undefined') Object.assign(window, { referenceCalls: calls });
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search); const dark = query.get('theme') !== 'light';
const wallet = { consented: true, verified: true, guest: true, chatEnabled: true,
  available: 100, paidAvailable: 100, accountToken: 'fixture-only' } as VibesWallet;
let chats: VibesChat[] = []; const turns: VibesTurn[] = [];
const api = {
  wallet: async () => wallet, chats: async () => chats, models: async () => [],
  createChat: async (id: string, title: string) => { chats = [...chats, { id, title, trial_slot: null, trial_used: 0 }]; return chats; },
  turns: async (id: string) => turns.filter(turn => turn.chatId === id),
  turn: async (id: string) => turns.find(turn => turn.id === id)!,
  quote: async (chatId: string, text: string, model: string, effort: unknown, integrations: string[]) => {
    const accepted = query.has('dropped') ? [] : integrations;
    const q = { chatId, text, model, integrations: accepted, project: chats.find(chat => chat.id === chatId)?.project_id };
    calls.push({ kind: 'quote', ...q });
    return { quote: JSON.stringify(q), integrations: accepted, model, maxCredits: 1, estimatedCredits: 1, expiresAt: Date.now() / 1000 + 120 };
  },
  submit: async (id: string, quote: string) => {
    const q = JSON.parse(quote); calls.push({ kind: 'send', ...q });
    const turn = { ...q, id, status: 'completed', prompt: q.text, response: 'Fixture answer from requested references.', charged: 1, reserved: 1,
      error: null, createdAt: new Date().toISOString() } as VibesTurn;
    turns.push(turn); return turn;
  },
  attach: async (chatId: string, hostId: string, projectId: string, binding: string) => {
    calls.push({ kind: 'attach', chatId, projectId });
    chats = chats.map(chat => chat.id === chatId ? { ...chat, host_id: hostId, project_id: projectId, binding } : chat);
  },
} as VibesApi;
let serial = 0;
const store = new VibesStore(api, () => `reference-${++serial}`, { read: async () => null, write: async () => {} });
store.update({ wallet, ready: true });
const catalogue = () => ({ enabled: true, integrations: fallbackIntegrations.map(app => ({ ...app, installed: !query.has('disconnected') })) });
const integrationApi = { catalogue: async () => catalogue(), connect: async () => catalogue(), disconnect: async () => catalogue() };
export function ChatReferencesFixture() {
  const [offline, setOffline] = useState(false);
  const workspace = { ...fixtureWorkspace, status: offline ? 'offline' as const : 'connected' as const,
    host: { id: 'mac', name: 'Fixture Mac', platform: 'macos' }, vibesToolsAvailable: true, viewOnly: false,
    railway: { status: 'ready' as const, account: 'fixture' },
    projects: [{ id: 'vault', name: 'Notes', path: '/notes', kind: 'vault' as const },
      { id: 'rail', name: 'Railway', path: '/virtual', kind: 'railway' as const }],
    actions: { ...fixtureWorkspace.actions, vibesProjectRequest: async (_method: string, params: Record<string, unknown>) => {
      calls.push({ kind: 'bind', ...params });
      if (query.has('delayed')) await new Promise<void>(resolve => Object.assign(window, { releaseReferenceBinding: resolve }));
      calls.push({ kind: 'binding-ready' }); return { binding: 'fixture-binding' };
    } },
  };
  return <ThemeContext.Provider value={{ dark, colors: dark ? palettes.dark : palettes.light }}>
    <SafeAreaProvider><VibesStoreProvider value={store}><IntegrationsProvider api={integrationApi} identity="reference-fixture">
      <SafeAreaView style={{ flex: 1, backgroundColor: dark ? palettes.dark.background : palettes.light.background }}><Button title="Fixture new chat" onPress={() => void store.select(null)} />
        <Button title="Fixture offline" onPress={() => setOffline(true)} />
        <VibesScreen workspace={workspace} computer onWallet={() => {}} onIntegrations={() => calls.push({ kind: 'open-integrations' })} />
      </SafeAreaView>
    </IntegrationsProvider></VibesStoreProvider></SafeAreaProvider>
  </ThemeContext.Provider>;
}

