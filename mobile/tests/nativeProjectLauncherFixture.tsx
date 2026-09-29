import { useMemo, useState } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import type { VibesApi, VibesChat } from '../src/vibes/types';
import type { Session, WorkspaceActions, TerminalModel } from '../src/ui/types';
import { VibesProvider } from '../src/vibes/VibesProvider';
import catalogue from './fixtures/projectTerminalModels.json';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const chats: VibesChat[] = [];
const api: VibesApi = { ...sampleVibesApi,
  chats: async () => chats, turns: async () => [],
  wallet: async () => ({ ...sampleWallet, available: 40, entitlements: { ...sampleWallet.entitlements, fundedTerminals: true } }),
  terminalModels: async () => [
    { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', family: 'OpenAI', trial: false, available: true, tools: true, source: 'vibyra', inputPerMillion: 1, outputPerMillion: 2 },
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', family: 'Anthropic', trial: false, available: true, tools: true, source: 'vibyra', inputPerMillion: 1, outputPerMillion: 2 },
    { id: 'inception/chat-only', name: 'Chat only model', family: 'Inception', trial: false, available: true, tools: false, source: 'vibyra', inputPerMillion: 1, outputPerMillion: 2 },
  ],
  createTerminal: async launch => {
    const chat: VibesChat = { id: launch.id, title: launch.title, host_id: launch.hostId, project_id: launch.projectId,
      binding: launch.binding, terminal_model: launch.model, terminal_model_name: launch.model === 'openai/gpt-6-astra' ? 'GPT-6 Astra' : launch.model, terminal_tools: launch.model !== 'inception/chat-only',
      terminal_budget_micro: launch.budget * 10000, trial_slot: null, trial_used: 0 };
    chats.push(chat); return chat;
  },
};

/** Native review with sample data; no computer commands or provider requests. */
function NativeProjectLauncherFixture() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const actions = useMemo<WorkspaceActions>(() => ({ ...fixtureWorkspace.actions,
    selectSession: setSelected,
    vibesProjectRequest: async () => ({ binding: '00000000-0000-4000-8000-000000000001' }),
    listTerminalModels: async () => ({ runnerKinds: ['codex', 'claude', 'gemini', 'opencode', 'qwen'], permissionsVersion: 1, permissionModes: ['standard', 'full'], models: catalogue as TerminalModel[] }),
    createSession: async (projectId, kind, title) => {
      const session: Session = { id: `preview-${Date.now()}`, projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
      setSessions(current => [...current, session]); setSelected(session.id); return session;
    },
    stopSession: async id => { setSessions(current => current.filter(session => session.id !== id)); setSelected(null); },
  }), []);
  return <SafeAreaProvider><VibesProvider api={api} identity="native-project-launcher-preview" purchases={null}>
    <WorkspaceApp workspace={{ ...fixtureWorkspace, actions, sessions, selectedSessionId: selected,
      conversation: null, terminalModelsAvailable: true, fundedTerminalsAvailable: true, host: { id: 'fixture-host', name: 'Preview Mac · Sample data', platform: 'macos' },
      projects: [{ id: 'fixture-project', name: 'Pocket', path: '~/Projects/Pocket' }],
    }} vibesEnabled />
  </VibesProvider></SafeAreaProvider>;
}
registerRootComponent(NativeProjectLauncherFixture);
