import { Alert } from 'react-native';
import { rowActions } from './rowActions';
import type { Project, WorkspaceModel } from './types';

export function nativeProjectActions(project: Project, workspace: WorkspaceModel,
  current: () => WorkspaceModel, reason: string | null) {
  if (reason) { Alert.alert(project.name, reason); return; }
  const apply = async (action: (value: WorkspaceModel) => Promise<void>) => {
    try {
      const value = current();
      if (value.host?.id !== workspace.host?.id || value.status !== 'connected'
        || (value.viewOnly && !value.canManage) || !value.projects.some(p => p.id === project.id))
        throw new Error('Reconnect to this computer before changing the project.');
      await action(value);
    } catch (error) { Alert.alert('Project could not be changed', String(error)); }
  };
  rowActions(project.name, [
    { title: 'Rename', run: () => Alert.prompt('Rename project', 'The folder name stays the same.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: (name?: string) => { const title = name?.trim();
        if (title && title.length <= 64) void apply(value => value.actions.renameProject!(project.id, title)); } },
    ], 'plain-text', project.name) },
    { title: 'Remove from Vibyra', destructive: true, run: () => Alert.alert('Remove this project?',
      'The folder and its files stay on your computer.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive',
          onPress: () => { void apply(value => value.actions.forgetProject!(project.id)); } },
      ]) },
  ]);
}
