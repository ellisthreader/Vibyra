import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon, IconButton } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { useAction } from './useAction';
import type { Project, WorkspaceModel } from './types';

export function ProjectsScreen({ workspace, onConnect, onNew }: {
  workspace: WorkspaceModel; onConnect: () => void; onNew: (projectId: string) => void;
}) {
  const { colors } = useTheme();
  const [review, setReview] = useState<Project>();
  const [query, setQuery] = useState('');
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const projects = workspace.projects.filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={busy || !!workspace.syncing} tintColor={colors.accent}
        onRefresh={() => void run(workspace.actions.refresh)} enabled={connected} />}>
      <View style={s.heading}><Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Projects</Text>
        <IconButton icon="refresh-outline" label="Refresh projects" disabled={!connected || busy} onPress={() => void run(workspace.actions.refresh)} /></View>
      {workspace.host && <View style={s.host}><Icon name="desktop-outline" size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[s.hostText, { color: colors.muted }]}>{workspace.host.name}</Text></View>}
      {(error || workspace.error) && <View style={s.notice}><Hint error>{error || workspace.error}</Hint></View>}
      {!connected && <View style={s.notice}><Hint>Connect to access your computer’s projects.</Hint>
        <Button title={workspace.host ? 'Reconnect' : 'Connect computer'} secondary busy={busy}
          onPress={workspace.host && workspace.actions.reconnect ? () => void run(workspace.actions.reconnect!) : onConnect} /></View>}
      {workspace.projects.length > 4 && <View style={[s.search, { backgroundColor: colors.elevated }]}>
        <Icon name="search-outline" size={18} color={colors.muted} /><TextInput value={query} onChangeText={setQuery}
          accessibilityLabel="Search projects" placeholder="Search projects" placeholderTextColor={colors.muted} style={[s.searchInput, { color: colors.text }]} /></View>}
      {!projects.length ? <EmptyState icon="folder-outline" title={query ? 'No matching projects' : 'No shared projects'}
        detail={query ? 'Try another name.' : 'Add a folder in Vibyra Host on your computer.'} /> :
        <View style={[s.list, { borderTopColor: colors.border }]}>{projects.map(project => <View key={project.id}
          style={[s.project, { borderBottomColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${project.name} files`} accessibilityState={{ disabled: !connected }}
            disabled={!connected} onPress={() => setReview(project)} style={({ pressed }) => [s.projectMain, { opacity: pressed ? 0.55 : 1 }]}>
            <Icon name="folder-outline" size={23} color={colors.muted} /><View style={s.projectText}>
              <Text style={[s.name, { color: colors.text }]}>{project.name}</Text>
              <View style={s.meta}>{project.branch && <Icon name="git-branch-outline" size={12} color={colors.muted} />}
                <Text numberOfLines={1} style={[s.path, { color: colors.muted }]}>{project.branch ?? project.path}</Text></View>
            </View>
          </Pressable>
          <IconButton icon="create-outline" label={`New chat in ${project.name}`} disabled={!connected} onPress={() => onNew(project.id)} />
        </View>)}</View>}
      {!!workspace.projects.length && <Text style={[s.note, { color: colors.muted }]}>Shared folders from your computer.</Text>}
    </ScrollView>
    <ReviewSheet visible={!!review} project={review} workspace={workspace} onClose={() => setReview(undefined)} />
  </>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 17, paddingBottom: 35 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { flex: 1, fontSize: 29, fontWeight: '600', letterSpacing: -0.9 },
  host: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9, marginBottom: 25 }, hostText: { flex: 1, fontSize: 12 },
  notice: { gap: 13, marginVertical: 18 }, list: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 5 },
  project: { flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 85 },
  projectMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 19 },
  projectText: { flex: 1, gap: 7 }, name: { fontSize: 16, fontWeight: '500', lineHeight: 22 }, meta: { flexDirection: 'row', gap: 5, alignItems: 'center' }, path: { flex: 1, fontSize: 12 },
  note: { fontSize: 12, lineHeight: 19, marginTop: 23 }, search: { minHeight: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, marginBottom: 17 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15 },
});
