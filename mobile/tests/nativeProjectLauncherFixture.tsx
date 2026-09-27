import { useMemo, useState } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { WorkspaceApp } from '../src/ui/WorkspaceApp';
import type { Session, WorkspaceActions } from '../src/ui/types';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

/** Native review with sample data; no computer commands or provider requests. */
function NativeProjectLauncherFixture() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const actions = useMemo<WorkspaceActions>(() => ({ ...fixtureWorkspace.actions,
    selectSession: setSelected,
    listTerminalModels: async () => ({ permissionsVersion: 1, permissionModes: ['standard', 'full'], models: [
      { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', kind: 'codex', isNew: true },
      { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', kind: 'claude', isNew: true },
      { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', kind: 'codex', isNew: true },
      { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', kind: 'codex', isNew: true },
    ] }),
    createSession: async (projectId, kind, title) => {
      const session: Session = { id: `preview-${Date.now()}`, projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
      setSessions(current => [...current, session]); setSelected(session.id); return session;
    },
    stopSession: async id => { setSessions(current => current.filter(session => session.id !== id)); setSelected(null); },
  }), []);
  return <SafeAreaProvider><VibesProvider api={sampleVibesApi} identity="native-project-launcher-preview" purchases={null}>
    <WorkspaceApp workspace={{ ...fixtureWorkspace, actions, sessions, selectedSessionId: selected,
      conversation: null, terminalModelsAvailable: true, host: { id: 'fixture-host', name: 'Preview Mac · Sample data', platform: 'macos' },
      projects: [{ id: 'fixture-project', name: 'Pocket', path: '~/Projects/Pocket' }],
    }} vibesEnabled />
  </VibesProvider></SafeAreaProvider>;
}
registerRootComponent(NativeProjectLauncherFixture);
