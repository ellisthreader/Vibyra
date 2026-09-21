import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon, IconButton } from './primitives';
import { knownProjects, IDEAS_PROJECT_ID, ideasProject } from './ideas';
import { useVibesChats } from '../vibes/VibesProvider';
import { chatsInProject } from './ideas';
import { canStartWork } from './mode';
import { ProjectTerminalRow } from './ProjectTerminalRow';
import { RailRow } from './RailRow';
import type { Destination, Project, WorkspaceModel } from './types';
export function FocusDrawer({ workspace, project, currentProjectId, bottom, onClose, onEnter, onOptions, onNavigate, onNew, onTerminal, onProject, onSettings, chats, closeThen }: {
  workspace: WorkspaceModel; project?: Project | null; currentProjectId?: string | null; bottom: number;
  onClose(): void; onEnter(id: string): void; onOptions(project: Project): void; onNavigate(to: Destination): void;
  onNew(): void; onTerminal(id: string): void; onProject(): void; onSettings(): void;
  chats?: (query: string, projectId?: string) => ReactNode; closeThen(action: () => void): void;
}) {
  const { colors } = useTheme();
  const phoneChats = useVibesChats().chats;
  const selectedId = project?.id ?? currentProjectId ?? IDEAS_PROJECT_ID;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [selectedId]: true });
  useEffect(() => { setExpanded(value => ({ ...value, [selectedId]: true })); }, [selectedId]);
  const projects = [ideasProject, ...knownProjects(workspace).filter(p => p.id !== IDEAS_PROJECT_ID)];
  return <View style={s.body}>
    <View style={s.heading}><Text accessibilityRole="header" style={[s.headingText, { color: colors.muted }]}>Projects</Text>
      <IconButton icon="add" label="New project" onPress={() => closeThen(onProject)} />
      <IconButton icon="close" label="Close navigation menu" onPress={onClose} /></View>
    <ScrollView style={s.body} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={s.list}>
      {projects.map(item => {
        const sessions = workspace.sessions.filter(session => session.projectId === item.id);
        const count = sessions.length + (chats ? chatsInProject(phoneChats, item.id, workspace).length : 0);
        const unfolded = expanded[item.id] ?? false;
        const selected = selectedId === item.id;
        const start = () => closeThen(() => item.id !== IDEAS_PROJECT_ID && canStartWork(workspace) ? onTerminal(item.id) : onNew());
        return <View key={item.id} style={s.group}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.name} accessibilityHint="Tap to show or hide sessions. Hold for workspace options."
            aria-expanded={unfolded} aria-selected={selected} accessibilityState={{ expanded: unfolded, selected }} onPress={() => {
              setExpanded(value => ({ ...value, [item.id]: !unfolded }));
              if (!unfolded && !selected) onEnter(item.id);
            }} onLongPress={item.id === IDEAS_PROJECT_ID ? undefined : () => onOptions(item)}
            style={({ pressed }) => [s.project, { backgroundColor: selected || pressed ? colors.elevated : 'transparent' }]}>
            <Text numberOfLines={1} style={[s.title, { color: selected ? colors.text : colors.muted, fontWeight: selected ? '600' : '400' }]}>{item.name}</Text>
            {count > 0 && <><Icon name={unfolded ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} />
              <View style={[s.badge, { backgroundColor: selected ? colors.background : colors.elevated }]}><Text style={[s.count, { color: colors.muted }]}>{count}</Text></View></>}
          </Pressable>
          {unfolded && <View style={s.sessions}>
            {chats?.('', item.id)}
            {sessions.map(session => <ProjectTerminalRow key={session.id} compact session={session} workspace={workspace} onOpen={() => { workspace.actions.selectSession(session.id); onNavigate('work'); }} />)}
            <Pressable accessibilityRole="button" accessibilityLabel={item.id === IDEAS_PROJECT_ID ? 'New chat' : `New chat in ${item.name}`} onPress={start} style={s.new}>
              <Icon name="add" size={14} color={colors.muted} /><Text style={[s.newText, { color: colors.muted }]}>{item.id !== IDEAS_PROJECT_ID && canStartWork(workspace) ? 'New terminal' : 'New chat'}</Text>
            </Pressable>
          </View>}
        </View>;
      })}
    </ScrollView>
    <View style={[s.footer, { paddingBottom: bottom, borderTopColor: colors.border }]}>
      <RailRow icon="desktop-outline" label={workspace.host?.name ?? 'Connect a computer'} detail={workspace.host && workspace.status !== 'connected' ? 'Offline' : undefined} onPress={() => onNavigate('computers')} />
      <RailRow icon="settings-outline" label="Settings" onPress={() => closeThen(onSettings)} />
      <View style={s.brand}><BrandMark size={17} /><Text style={{ color: colors.muted, fontFamily: 'DM Sans', fontSize: 12 }}>vibyra</Text></View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  heading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingLeft: 25, paddingRight: 6 },
  headingText: { flex: 1, fontFamily: 'DM Sans', fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  group: { marginBottom: 4 },
  project: { minHeight: 48, paddingHorizontal: 13, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: 'DM Sans', fontSize: 18, letterSpacing: 0.1 },
  badge: { minWidth: 27, height: 23, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 13, fontWeight: '500' },
  sessions: { paddingLeft: 24, paddingTop: 2, paddingBottom: 4 },
  new: { minHeight: 44, flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 12 },
  newText: { fontFamily: 'DM Sans', fontSize: 13 },
  footer: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingTop: 9 },
});
