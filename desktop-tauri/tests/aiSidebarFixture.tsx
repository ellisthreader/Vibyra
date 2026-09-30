import { ProjectWorkspace } from '../src/components/layout/ProjectWorkspace';
import { useChatStore } from '../src/state/chatStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore, type PaneState } from '../src/state/terminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';

/** Real workspace geometry, with suspended terminals so QA never launches a process. */
export function prepareAiSidebarFixture() {
  const settings = useSettingsStore.getState().settings!;
  useSettingsStore.setState({ settings: { ...settings, scrollbackLines: 1000, projects: [
    ...settings.projects, { id: 'garden', name: 'Garden', root: '/Projects/Garden' },
  ] } });
  const panes: PaneState[] = ['Claude Code', 'Codex'].map((title, index) => ({
    id: -index - 1, projectId: 'studio', agentId: index ? 'codex' : 'claude', title,
    status: 'suspended', visibility: 'visible', snapshot: 'Workspace ready.\nYour saved terminal stays in place.',
    model: null, permissionMode: 'standard', reasoningEffort: null, sourceCwd: '/Projects/Studio',
    workspaceMode: 'shared', safeSnapshotFingerprint: null, customTitle: null, osc: null,
    accent: '', exitCode: null, lastFocusedAt: 0, agentSessionId: null, accountId: null,
  }));
  useTerminalStore.setState({ panes, sessionReady: true });
  Object.assign(window, {
    fixtureChat: useChatStore,
    fixtureProject: (id: string) => {
      useProjectStore.setState({ activeId: id });
      useWorkspaceStore.setState({ root: `/Projects/${id === 'studio' ? 'Studio' : 'Garden'}` });
    },
  });
}

export function AiSidebarWorkspace() { return <ProjectWorkspace />; }
