import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { Session, TerminalModel, WorkspaceActions, WorkspaceModel } from '../src/ui/types';

const query = new URLSearchParams(location.search);
const models: TerminalModel[] = [
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', kind: 'codex', isNew: true },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', kind: 'claude', isNew: true },
  { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', kind: 'codex', isNew: true },
];
const chats = [{ id: 'saved-project-chat', title: 'Saved project chat', trial_slot: null, trial_used: 0,
  host_id: 'fixture-host', project_id: 'fixture-project' }];
const api = { ...sampleVibesApi, chats: async () => chats, turns: async () => [],
  wallet: async () => ({ ...sampleWallet, chatEnabled: true }) };
const events = { starts: [] as unknown[][], finish: null as (() => void) | null };
Object.assign(window, { launcherEvents: events });

function Fixture() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const actions = useMemo<WorkspaceActions>(() => ({ ...fixtureWorkspace.actions,
    selectSession: setSelected,
    listTerminalModels: async () => {
      if (query.has('catalogue-error')) throw new Error('Models unavailable. Please retry.');
      return { models, permissionsVersion: query.has('legacy-permissions') ? undefined : 1, permissionModes: ['standard', 'full'] };
    },
    createSession: async (projectId, kind, title, options) => {
      events.starts.push([projectId, kind, title, options]);
      if (query.has('fail')) throw new Error('Your computer could not start this terminal.');
      if (query.has('slow')) await new Promise<void>(resolve => { events.finish = resolve; });
      const session: Session = { id: 'new-terminal', projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
      setSessions([session]); setSelected(session.id); return session;
    },
  }), []);
  const workspace: WorkspaceModel = { ...fixtureWorkspace, actions, sessions, selectedSessionId: selected, conversation: null,
    terminalModelsAvailable: !query.has('old'), viewOnly: query.has('watching'), canManage: false,
    status: query.has('offline') ? 'offline' : 'connected', remembered: { projects: fixtureWorkspace.projects, seenAt: new Date().toISOString() },
    themePreference: query.get('theme') === 'light' ? 'light' : 'dark' };
  return <WorkspaceApp workspace={workspace} vibesEnabled />;
}
createRoot(document.getElementById('root')!).render(<SafeAreaProvider
  initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  <VibesProvider api={api} identity="project-launcher@example.test" purchases={null}><Fixture /></VibesProvider>
</SafeAreaProvider>);
