import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { normalizeModels } from '../src/vibes/api';
import { VibesProvider } from '../src/vibes/VibesProvider';
import type { VibesApi, VibesChat, VibesWallet } from '../src/vibes/types';
import { NewSessionSheet } from '../src/ui/NewSessionSheet';
import { projects, sessions } from '../src/demo/data';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

// The New terminal sheet on its own, open in the sample Studio project, with a
// Vibyra tokens account that can run five companies' models. `phone=old` is a
// computer whose Host predates project tools. Starts land on `window.started`
// (computer) or `window.vibesCalls` and `window.openedChat` (phone).
const calls: string[] = []; let chats: VibesChat[] = [];
export const newSessionEvents = { vibesCalls: calls, started: null as [string, string, string] | null, openedChat: false,
  model: null as string | null, safeMode: null as boolean | null, startCount: 0, finishStart: null as (() => void) | null };
const wallet: VibesWallet = { version: 1, guest: false, available: 30, held: 0, total: 30, paidAvailable: 20,
  plan: 'builder', paidUntil: null, trialChatsRemaining: 0, trialCredits: 0, trialChats: 0, trialChatCredits: 0,
  accountToken: 'fixture-account', consented: true, verified: true, purchasesEnabled: false, products: [],
  entitlements: { maxProjects: 10, concurrentReplies: 2, fullCatalogue: false, remoteAccess: false },
  planEntitlements: {}, remoteAccessLive: false, usedProjects: 0 } as unknown as VibesWallet;
const catalogue = [['openai/gpt-5.6-luna', 'GPT-5.6 Luna'], ['anthropic/claude-sonnet-5', 'Sonnet 5'],
  ['google/gemini-3.8-flash', 'Gemini 3.8 Flash'], ['x-ai/grok-4.6', 'Grok 4.6'], ['moonshotai/kimi-k2.7-code', 'Kimi K2.7 Code']];
const api = {
  wallet: async () => ({ ...wallet }), consent: async () => {}, chats: async () => [...chats],
  models: async () => normalizeModels(catalogue.map(([id, name]) => ({ id, name, family: name, trial: true, available: true,
    input_per_million: 1, output_per_million: 2, reasoning: [] }))),
  createChat: async (id: string, title: string) => { calls.push(`createChat:${title}`);
    chats = [{ id, title, trial_slot: null, trial_used: 0 } as VibesChat, ...chats]; return chats; },
  attach: async (_chatId: string, _hostId: string, projectId: string, binding: string) => { calls.push(`attach:${projectId}:${binding}`); },
  turns: async () => [], turn: async () => { throw new Error('none'); }, cancel: async () => {},
} as unknown as VibesApi;

export function NewSessionFixtureScreen({ dark = true, oldHost = false, offline = false, longNames = false, deferStart = false, onClose = () => {} }: {
  dark?: boolean; oldHost?: boolean; offline?: boolean; longNames?: boolean; deferStart?: boolean; onClose?: () => void;
}) {
  const workspace: WorkspaceModel = { ...fixtureWorkspace, host: { id: 'demo-mac', name: 'Studio Mac', platform: 'macos' },
    projects: longNames ? projects.map(p => ({ ...p, name: 'A very long project name for a small iPhone' })) : projects,
    sessions, status: offline ? 'offline' : 'connected', vibesToolsAvailable: !oldHost, terminalModelsAvailable: !oldHost,
    actions: { ...fixtureWorkspace.actions,
      listTerminalModels: async () => ({ models: [
        { id: "openai/gpt-6-sol", name: "GPT-6 Sol", kind: "codex", isNew: true },
        { id: "openai/gpt-6-luna", name: "GPT-6 Luna", kind: "codex", isNew: true },
        { id: "openai/gpt-6-astra", name: "GPT-6 Astra", kind: "codex", isNew: true },
        { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", kind: "claude", isNew: true },
        { id: "anthropic/claude-fable-5.1", name: "Claude Fable 5.1", kind: "claude", isNew: true },
      ] }),
      createSession: async (projectId, kind, title, options) => {
        newSessionEvents.startCount++; newSessionEvents.started = [projectId, kind, title];
        newSessionEvents.safeMode = options?.safeMode ?? null; newSessionEvents.model = options?.model ?? null;
        if (deferStart) await new Promise<void>(resolve => { newSessionEvents.finishStart = resolve; });
      },
      vibesProjectRequest: async (method, params) => { calls.push(`${method}:${params.projectId}`); return { binding: 'fixture-binding' }; } } };
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <VibesProvider api={api} identity="fixture@vibyra.app" purchases={null}>
        <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
          <NewSessionSheet visible workspace={workspace} initialProjectId="demo-studio" onClose={onClose}
            onOpenChat={() => { newSessionEvents.openedChat = true; }} />
        </View>
      </VibesProvider>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
