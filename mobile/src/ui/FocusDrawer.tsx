import { styles as s } from './FocusDrawerStyles';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, IconButton } from './primitives';
import { DrawerFooterActions } from './DrawerFooterActions';
import { DrawerComputerAction } from './DrawerComputerAction';
import { ProjectTree } from './ProjectTree';
import type { Destination, Project, WorkspaceModel } from './types';

export function FocusDrawer({ workspace, project, currentProjectId, bottom, onClose, onEnter,
  onOptions, onNavigate, onNew, onTerminal, onProject, onSettings, onReport, chats, closeThen,
}: {
  workspace: WorkspaceModel;
  project?: Project | null;
  currentProjectId?: string | null;
  bottom: number;
  onClose(): void;
  onEnter(id: string): void;
  onOptions(project: Project): void;
  onNavigate(to: Destination): void;
  onNew(): void;
  onTerminal(id: string): void;
  onProject(): void;
  onSettings(): void;
  onReport?: () => void;
  chats?: (query: string, projectId?: string) => ReactNode;
  closeThen(action: () => void): void;
}) {
  const { colors } = useTheme();
  return <View style={s.body}>
    <View style={s.heading}>
      <BrandMark size={22} />
      <Text accessibilityRole="header" style={[s.headingText, { color: colors.text }]}>Vibyra</Text>
      <IconButton icon="add" label="New project" onPress={() => closeThen(onProject)} />
      <IconButton icon="close" label="Close navigation menu" onPress={onClose} />
    </View>
    <ProjectTree workspace={workspace} selectedId={project?.id ?? currentProjectId}
      onEnter={onEnter} onOptions={onOptions} onNavigate={onNavigate}
      onNew={onNew} onTerminal={onTerminal} chats={chats} closeThen={closeThen} />
    <View style={[s.footer, { paddingBottom: bottom, borderTopColor: colors.border }]}>
      <DrawerComputerAction workspace={workspace} onPress={() => onNavigate('computers')} />
      <DrawerFooterActions onSettings={() => closeThen(onSettings)}
        onReport={onReport ? () => closeThen(onReport) : undefined} />
    </View>
  </View>;
}
