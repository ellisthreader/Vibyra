import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { useVibesChats } from '../vibes/VibesProvider';
import { DrawerProjectBranch } from './DrawerProjectBranch';
import { styles as s } from './FocusDrawerStyles';
import { chatsInProject, IDEAS_PROJECT_ID, knownProjects } from './ideas';
import { canStartWork } from './mode';
import { Icon } from './primitives';
import { ProjectTerminalRow } from './ProjectTerminalRow';
import { TreeAction } from './TreeRow';
import type { Project, WorkspaceModel } from './types';

export function ProjectTree({ workspace, selectedId, onEnter, onOptions, onOpenSession, onNew,
  onTerminal, chats, closeThen }: {
  workspace: WorkspaceModel;
  selectedId?: string | null;
  onEnter(id: string): void;
  onOptions(project: Project): void;
  onOpenSession(id: string): void;
  onNew(): void;
  onTerminal(id: string): void;
  chats?: (query: string, projectId?: string) => ReactNode;
  closeThen(action: () => void): void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const phoneChats = useVibesChats().chats;
  const projects = knownProjects(workspace).filter((item) => item.id !== IDEAS_PROJECT_ID);
  const pageSize = Math.max(3, Math.min(7, Math.floor((height - 410) / 52)));
  const pageCount = Math.max(1, Math.ceil(projects.length / pageSize));
  const selected = selectedId ?? IDEAS_PROJECT_ID;
  const selectedIndex = projects.findIndex((item) => item.id === selected);
  const [page, setPage] = useState(() => Math.max(0, Math.floor(selectedIndex / pageSize)));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const list = useRef<ScrollView>(null);
  useEffect(() => {
    if (selectedIndex >= 0) {
      setPage(Math.floor(selectedIndex / pageSize));
      setExpanded((value) => ({ ...value, [selected]: true }));
    }
  }, [selected, selectedIndex, pageSize]);
  const currentPage = Math.min(page, pageCount - 1);
  const changePage = (next: number) => {
    setPage(next);
    list.current?.scrollTo({ y: 0, animated: false });
  };
  return <>
    <ScrollView ref={list} style={s.body} contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}>
      <Text style={[s.section, { color: colors.muted }]}>Projects</Text>
      {projects.length === 0 && <Text style={[s.empty, { color: colors.muted }]}>Your projects appear here.</Text>}
      {projects.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((item) => {
        const sessions = workspace.sessions.filter((session) => session.projectId === item.id);
        const count = sessions.length + (chats ? chatsInProject(phoneChats, item.id, workspace).length : 0);
        const unfolded = expanded[item.id] ?? false;
        const terminal = canStartWork(workspace);
        return <DrawerProjectBranch key={item.id} label={item.name}
          icon={item.kind === 'vault' ? 'book-outline' : 'folder-outline'}
          selected={selected === item.id} expanded={unfolded} count={count}
          running={sessions.some((session) => session.status === 'running')}
          onLongPress={() => onOptions(item)}
          onPress={() => onEnter(item.id)}
          onExpand={() => setExpanded((value) => ({ ...value, [item.id]: !unfolded }))}>
          {chats?.('', item.id)}
          {sessions.map((session) => <ProjectTerminalRow key={session.id} compact session={session}
            workspace={workspace} onOpen={() => onOpenSession(session.id)} />)}
          <TreeAction label={`${terminal ? 'New terminal' : 'New chat'} in ${item.name}`} title={terminal ? 'New terminal' : 'New chat'}
            onPress={() => closeThen(() => terminal ? onTerminal(item.id) : onNew())} />
        </DrawerProjectBranch>;
      })}
    </ScrollView>
    {pageCount > 1 && <View style={[s.pager, { borderTopColor: colors.border }]}>
      <PageArrow direction="back" disabled={currentPage === 0} onPress={() => changePage(currentPage - 1)} />
      <Text accessibilityLabel={`Projects page ${currentPage + 1} of ${pageCount}`}
        style={[s.pageNumber, { color: colors.muted }]}>{currentPage + 1} / {pageCount}</Text>
      <PageArrow direction="forward" disabled={currentPage === pageCount - 1}
        onPress={() => changePage(currentPage + 1)} />
    </View>}
  </>;
}

function PageArrow({ direction, disabled, onPress }: { direction: 'back' | 'forward'; disabled: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${direction === 'back' ? 'Previous' : 'Next'} projects page`}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.pageArrow, { backgroundColor: pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.3 : 1 }]}>
    <Icon name={direction === 'back' ? 'chevron-back' : 'chevron-forward'} size={17} color={colors.text} />
  </Pressable>;
}
