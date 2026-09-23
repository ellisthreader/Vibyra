import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sampleIntegrationsApi } from '../src/demo/sampleIntegrations';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import type { WorkspaceModel } from '../src/ui/types';
import { VibesProvider } from '../src/vibes/VibesProvider';
import type { VibesApi, VibesChat, VibesTurn } from '../src/vibes/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// The whole app as the iPhone runs it, connected to a computer. `?watching=1` is a
// Vibyra Desktop, which only lets the phone watch; without it, a standalone Host.
const query = new URLSearchParams(location.search);
const watching = query.get('watching') === '1';
let chats: VibesChat[] = []; const turns: VibesTurn[] = [];
const api: VibesApi = { ...sampleVibesApi,
  wallet: async () => ({ ...sampleWallet, chatEnabled: true }),
  chats: async () => [...chats],
  createChat: async (id, title) => { chats = [{ id, title, trial_slot: null, trial_used: 0 }, ...chats]; return chats; },
  quote: async (chatId, text, model, effort) => ({ quote: JSON.stringify({ chatId, text, model }), maxCredits: 2,
    estimatedCredits: 1, model, effort: effort ?? null, expiresAt: Date.now() / 1000 + 120 }),
  submit: async (id, quote) => {
    const q = JSON.parse(quote);
    const turn: VibesTurn = { id, chatId: q.chatId, model: q.model, status: 'completed', prompt: q.text,
      response: 'A reply from the phone chat.', reserved: 2, charged: 1, error: null, createdAt: new Date().toISOString() };
    turns.push(turn); return turn;
  },
  turns: async id => turns.filter(turn => turn.chatId === id), turn: async id => turns.find(turn => turn.id === id)!,
};
const email = 'watch-fixture@example.test';
const workspace: WorkspaceModel = { ...fixtureWorkspace, viewOnly: watching, canType: false,
  themePreference: query.get('theme') === 'light' ? 'light' : 'dark',
  account: { name: 'Watch fixture', email, plan: 'free' }, selectedSessionId: null, conversation: null,
  sessions: [{ id: 'mac-terminal', projectId: 'fixture-project', title: 'Mac terminal', kind: 'shell', status: 'running',
    readOnly: watching, createdAt: '2026-09-11T09:00:00Z' }] };

createRoot(document.getElementById('root')!).render(<SafeAreaProvider
  initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  <VibesProvider api={api} identity={email} purchases={null}>
    <IntegrationsProvider api={sampleIntegrationsApi} identity={email}>
      <WorkspaceApp workspace={workspace} vibesEnabled />
    </IntegrationsProvider>
  </VibesProvider>
</SafeAreaProvider>);
