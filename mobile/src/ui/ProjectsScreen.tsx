import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { useAction } from './useAction';
import type { Project, WorkspaceModel } from './types';

export function ProjectsScreen({ workspace, onConnect, onNew }: {
  workspace: WorkspaceModel; onConnect: () => void; onNew: (projectId: string) => void;
}) {
  const { colors } = useTheme();
  const [review, setReview] = useState<Project>();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  return <>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={busy} tintColor={colors.accent}
      onRefresh={() => void run(workspace.actions.refresh)} enabled={connected} />}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Projects</Text>
      {error && <Hint error>{error}</Hint>}
      {!connected && <View style={s.connection}><Hint>Connect your computer to browse its shared projects.</Hint>
        <Button title="Connect computer" secondary onPress={onConnect} /></View>}
      {workspace.projects.length === 0 ? <EmptyState icon="folder-outline" title="A place for your ideas"
        detail="Share a project folder from Vibyra Host on your computer. Its files stay on that computer." /> :
        workspace.projects.map(project => <View key={project.id} style={[s.project, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.heading}><View style={[s.folder, { backgroundColor: colors.elevated }]}><Icon name="folder-outline" size={23} /></View>
            <View style={s.headingText}><Text style={[s.name, { color: colors.text }]}>{project.name}</Text>
              <Text numberOfLines={1} style={[s.host, { color: colors.muted }]}>{workspace.host?.name ?? 'Computer'}</Text></View>
          </View>
          <Text selectable numberOfLines={2} style={[s.path, { color: colors.muted }]}>{project.path}</Text>
          {project.branch && <View style={s.branch}><Icon name="git-branch-outline" size={14} color={colors.muted} />
            <Text numberOfLines={1} style={[s.branchName, { color: colors.muted }]}>{project.branch}</Text></View>}
          <View style={[s.actions, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" disabled={!connected} onPress={() => setReview(project)} style={s.action}>
              <Icon name="documents-outline" size={18} color={connected ? colors.text : colors.muted} />
              <Text style={[s.actionText, { color: connected ? colors.text : colors.muted }]}>Files & changes</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={!connected} onPress={() => onNew(project.id)} style={s.action}>
              <Icon name="add" size={18} color={connected ? colors.accent : colors.muted} />
              <Text style={[s.actionText, { color: connected ? colors.accent : colors.muted }]}>New work</Text></Pressable>
          </View>
        </View>)}
      {workspace.projects.length > 0 && <View style={s.note}><Hint>Manage shared folders on your computer. Only projects you have explicitly shared are available here.</Hint></View>}
    </ScrollView>
    <ReviewSheet visible={!!review} project={review} workspace={workspace} onClose={() => setReview(undefined)} />
  </>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40, gap: 18 }, title: { fontSize: 29,
    fontWeight: '600', letterSpacing: -0.8, marginBottom: 5 }, connection: { gap: 14 },
  project: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, paddingHorizontal: 18, paddingTop: 19 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13 }, folder: { width: 45, height: 45, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center' }, headingText: { flex: 1, gap: 5 }, name: { fontSize: 18, fontWeight: '600' },
  host: { fontSize: 12 }, path: { marginTop: 16, marginBottom: 12, fontSize: 12, lineHeight: 19 },
  branch: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 14 }, branchName: { flex: 1, fontSize: 12 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: 4 },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 6 }, actionText: { fontSize: 13, fontWeight: '500' },
  note: { paddingTop: 8 },
});
