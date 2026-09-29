import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { Session, TerminalModel, WorkspaceActions, WorkspaceModel } from '../src/ui/types';

import type { FundedModel, VibesChat, VibesApi } from '../src/vibes/types';

import catalogue from './fixtures/projectTerminalModels.json';

const query = new URLSearchParams(location.search);
const models: TerminalModel[] = [
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', kind: 'codex', isNew: true },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', kind: 'claude', isNew: true },
  { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', kind: 'codex', isNew: true },
  { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', kind: 'gemini', isNew: false },
  { id: 'x-ai/grok-4.6', name: 'Grok 4.6', kind: 'opencode', isNew: false },
  { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro', kind: 'opencode', isNew: false },
  { id: 'qwen/qwen3.8-max-0902', name: 'Qwen 3.8 Max', kind: 'qwen', isNew: false },
];
models.push(...(catalogue as TerminalModel[]).filter(model => !models.some(existing => existing.id === model.id)));
const chats: VibesChat[] = [{ id: 'saved-project-chat', title: 'Saved project chat', trial_slot: null, trial_used: 0,
  host_id: 'fixture-host', project_id: 'fixture-project' }];
const tokenModels: FundedModel[] = [
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', family: 'OpenAI', available: true, tools: true, source: 'vibyra', trial: false, inputPerMillion: 1, outputPerMillion: 2 },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', family: 'Anthropic', available: true, tools: true, source: 'vibyra', trial: false, inputPerMillion: 1, outputPerMillion: 2 },
  ...Array.from({ length: 425 }, (_, i): FundedModel => ({ id: `inception/chat-${i}`, name: `Chat ${i}`, family: 'Inception',
    source: 'vibyra', available: i !== 1, unavailableReason: i === 1 ? 'Pricing is being refreshed.' : null, tools: false, trial: false, inputPerMillion: 0.1, outputPerMillion: 0.2 })),
];
models.forEach(model => { model.efforts = ['codex', 'claude'].includes(model.kind) ? ['low', 'medium', 'high'] : []; });
const api: VibesApi = { ...sampleVibesApi, chats: async () => chats, turns: async () => [],
  wallet: async () => ({ ...sampleWallet, plan: 'pro', chatEnabled: true, available: query.has('zero') ? 0 : 40,
    entitlements: { ...sampleWallet.entitlements, safeWorktrees: true, fundedTerminals: query.has('funded') } }),
  terminalModels: async () => tokenModels,
  quote: async (...args) => { events.quotes.push(args); return sampleVibesApi.quote(...args); },
  submit: async (...args) => { events.submissions.push(args); return sampleVibesApi.submit(...args); },
  terminalDecision: async request => { events.decisions.push(request); if (query.has('auto-fail')) throw new Error('Auto unavailable');
    if (query.has('decision-slow')) await new Promise<void>(resolve => { events.finish = resolve; });
    if (query.has('invalid-decision')) return { model: 'typesafe/jev-router', name: 'Router', effort: null };
    const model = request.models.find(m => m.id === 'anthropic/claude-opus-5.5') ?? request.models[0];
    return { model: model.id, name: model.name, effort: model.efforts.includes('high') ? 'high' : null }; },
  createTerminal: async launch => {
    events.funded.push(launch);
    const chat: VibesChat = { id: launch.id, title: launch.title, host_id: launch.hostId, project_id: launch.projectId,
      binding: launch.binding, terminal_model: launch.model, terminal_effort: launch.effort, terminal_tools: tokenModels.find(m => m.id === launch.model)?.tools,
      terminal_budget_micro: launch.budget * 10000, trial_slot: null, trial_used: 0 };
    chats.push(chat); return chat;
  } };
const events = { messages: [] as unknown[], quotes: [] as unknown[], submissions: [] as unknown[], decisions: [] as unknown[], funded: [] as unknown[], starts: [] as unknown[][], status: 'connected' as 'connected' | 'offline', connection: null as ((status: 'connected' | 'offline') => void) | null, finish: null as (() => void) | null };
Object.assign(window, { launcherEvents: events });

function Fixture() {
  const [connection, setConnection] = useState<'connected' | 'offline'>(query.has('offline') ? 'offline' : 'connected');
  events.connection = setConnection; events.status = connection;
  const [sessions, setSessions] = useState<Session[]>(query.has('existing') ? [fixtureSession] : query.has('restore-sessions') ? JSON.parse(sessionStorage.getItem('fixture-sessions') || '[]') : []);
  const [selected, setSelected] = useState<string | null>(query.has('existing') ? fixtureSession.id : null);
  const actions = useMemo<WorkspaceActions>(() => ({ ...fixtureWorkspace.actions,
    selectSession: setSelected,
    submitTurn: async (...args) => { events.messages.push(args); if (query.has('send-fail')) throw new Error('Delivery uncertain'); },
    aiAccounts: async () => ({ defaults: query.has('signed-out-default') ? { claude: 'signed-out' } : {}, providers: ['codex', 'claude'].map(id => ({ id, runtimeId: id, company: id === 'codex' ? 'OpenAI' : 'Anthropic', product: id, installed: true, accounts: [{ accountId: 'default', accountLabel: 'Connected account', status: query.has('disconnected-provider') && id === 'claude' ? 'sign-in-required' : 'connected', detail: 'Ready' }, ...(query.has('signed-out-default') && id === 'claude' ? [{ accountId: 'signed-out', status: 'sign-in-required' }] : [])] })) }),
    vibesProjectRequest: async () => ({ binding: '00000000-0000-4000-8000-000000000001' }),
    listTerminalModels: async () => {
      if (query.has('catalogue-error')) throw new Error('Models unavailable. Please retry.');
      return { models, runnerKinds: query.has('legacy-runners') ? undefined : ['codex', 'claude', 'gemini', 'opencode', 'qwen'],
        effortVersion: 1, permissionsVersion: query.has('legacy-permissions') ? undefined : 1, permissionModes: ['standard', 'full'] };
    },
    createSession: async (projectId, kind, title, options) => {
      events.starts.push([projectId, kind, title, options]);
      if (query.has('fail')) throw new Error('Your computer could not start this terminal.');
      if (query.has('slow')) await new Promise<void>(resolve => { events.finish = resolve; });
      const session: Session = { ...(options?.requestId ? { runner: 'conversation' as const } : {}), id: 'new-terminal', projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
      setSessions(current => { const rows = [...current.filter(row => row.id !== session.id), session]; if (query.has('restore-sessions')) sessionStorage.setItem('fixture-sessions', JSON.stringify(rows)); return rows; }); setSelected(session.id); return session;
    },
  }), []);
  const workspace: WorkspaceModel = { ...fixtureWorkspace, account: { email: 'project-launcher@example.test', name: 'Test', plan: 'pro' }, actions, sessions, selectedSessionId: selected, conversation: null,
    conversationAvailable: !query.has('no-conversations'), conversationProviders: query.has('codex-only') ? ['codex'] : ['codex', 'claude'],
    fundedTerminalsAvailable: query.has('funded') && !query.has('old'),
    aiAccountsAvailable: !query.has('old'), terminalModelsAvailable: !query.has('old'), previewAvailable: true, viewOnly: query.has('watching'), canManage: false,
    status: connection, remembered: { projects: fixtureWorkspace.projects, seenAt: new Date().toISOString() },
    themePreference: query.get('theme') === 'light' ? 'light' : 'dark' };
  return <WorkspaceApp workspace={workspace} vibesEnabled />;
}
createRoot(document.getElementById('root')!).render(<SafeAreaProvider
  initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  <VibesProvider api={api} identity="project-launcher@example.test" purchases={null}><Fixture /></VibesProvider>
</SafeAreaProvider>);
