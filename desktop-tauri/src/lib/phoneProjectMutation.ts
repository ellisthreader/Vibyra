import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../state/settingsStore';
import { useProjectStore } from '../state/projectStore';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import type { PhoneProjectOpened } from '../ipc/phone';
/** Native owns exact effects; these updates only reconcile the displayed workspace. */
export async function phoneProjectMutation(id: string, action: 'rename' | 'forget' | 'adopt') {
  const result = await invoke<PhoneProjectOpened>('phone_project_mutate', { id });
  await useSettingsStore.getState().load();
  if (action === 'forget') {
    useTerminalStore.setState(state => ({ panes: state.panes.filter(pane => pane.projectId !== result.id),
      focusedId: state.panes.find(pane => pane.id === state.focusedId)?.projectId === result.id ? null : state.focusedId,
      zoomedId: state.panes.find(pane => pane.id === state.zoomedId)?.projectId === result.id ? null : state.zoomedId }));
    const project = useProjectStore.getState();
    if (project.activeId === result.id) {
      useProjectStore.setState({ activeId: null, view: 'home' });
      useWorkspaceStore.setState({ root: project.homeDir });
    }
  } else if (action === 'adopt') {
    useProjectStore.setState({ activeId: result.id, view: 'project' });
    useWorkspaceStore.setState({ root: result.path, projectMode: 'terminals' });
  }
  return result;
}
