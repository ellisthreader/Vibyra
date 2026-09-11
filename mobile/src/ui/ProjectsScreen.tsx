import { useState } from 'react';
import { LayoutAnimation, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon, SectionLabel } from './primitives';
import { ProjectRow } from './ProjectRow';
import { ReviewSheet } from './ReviewSheet';
import { useAction } from './useAction';
import { useReducedMotion } from './useReducedMotion';
import type { Project, Session, WorkspaceModel } from './types';

const rank = (session: Session) => (session.status === 'running' ? 0 : 1);

// One page and one list, the way the desktop navigation column draws it: a quiet
// section label, a search that reaches terminals as well as folders, and projects
// that open in place to show the terminals inside them. Tapping a terminal here
// is the same action as tapping it in the rail — it opens that session.
export function ProjectsScreen({ workspace, onConnect, onNew, onOpenSession }: {
  workspace: WorkspaceModel; onConnect: () => void; onNew: (projectId: string) => void; onOpenSession: (id: string) => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [review, setReview] = useState<Project>();
  const [query, setQuery] = useState('');
  // `undefined` follows the workspace — the open session's project, or the only
  // project there is. `''` is a project the reader closed by hand.
  const [chosen, setChosen] = useState<string>();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  // A paired Vibyra Desktop shows the projects it is working in and refuses
  // every request that would change them, so this page watches rather than acts.
  const watching = workspace.viewOnly === true;
  const term = query.trim().toLowerCase();
  // Live terminals lead, then the most recent, so the one you are likely to want
  // is the first row under the folder rather than wherever the host listed it.
  const sessionsOf = (id: string) => workspace.sessions.filter(session => session.projectId === id)
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
  const named = (project: Project) => project.name.toLowerCase().includes(term);
  const auto = workspace.sessions.find(session => session.id === workspace.selectedSessionId)?.projectId
    ?? (workspace.projects.length === 1 ? workspace.projects[0]!.id : undefined);
  const openId = chosen === undefined ? auto : chosen || undefined;
  // Searching opens what it found: a terminal matched inside a closed project is
  // no use if reaching it still takes a tap on the folder.
  const projects = term ? workspace.projects.filter(project => named(project)
    || sessionsOf(project.id).some(session => session.title.toLowerCase().includes(term))) : workspace.projects;
  const listed = (project: Project) => term && !named(project)
    ? sessionsOf(project.id).filter(session => session.title.toLowerCase().includes(term))
    : sessionsOf(project.id);
  const toggle = (id: string) => {
    if (!reduced && Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChosen(openId === id ? '' : id);
  };
  const searchable = workspace.projects.length > 3 || workspace.sessions.length > 4;
  return <>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={busy || !!workspace.syncing} tintColor={colors.accent}
        onRefresh={() => void run(workspace.actions.refresh)} enabled={connected} />}>
      {workspace.host ? <View style={s.host}><Icon name="desktop-outline" size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[s.hostText, { color: colors.muted }]}>{workspace.host.name}</Text></View> : null}
      {error || workspace.error ? <View style={s.notice}><Hint error>{error || workspace.error}</Hint></View> : null}
      {!connected ? <View style={s.notice}><Hint>Connect to access your computer’s projects.</Hint>
        <Button title={workspace.host ? 'Reconnect' : 'Connect computer'} secondary busy={busy}
          onPress={workspace.host && workspace.actions.reconnect ? () => void run(workspace.actions.reconnect!) : onConnect} /></View> : null}
      {searchable ? <View style={[s.search, { backgroundColor: colors.elevated }]}>
        <Icon name="search-outline" size={17} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Search projects and terminals"
          placeholder="Search projects and terminals" placeholderTextColor={colors.muted}
          style={[s.searchInput, { color: colors.text }]} /></View> : null}
      {projects.length === 0 ? <EmptyState icon="folder-outline" title={term ? 'No matches' : 'No shared projects'}
        detail={term ? 'Try another project or terminal name.'
          : watching ? 'Open a project in Vibyra on your computer.'
            : 'Add a folder in Vibyra Host on your computer.'} /> : <>
        <SectionLabel>Projects</SectionLabel>
        <View style={s.list}>{projects.map(project => <ProjectRow key={project.id} project={project}
          sessions={listed(project)} open={term ? true : openId === project.id} connected={connected}
          watching={watching} selectedId={workspace.selectedSessionId} onToggle={() => toggle(project.id)}
          onOpenSession={onOpenSession} onNew={() => onNew(project.id)} onFiles={() => setReview(project)} />)}</View>
        <Text style={[s.note, { color: colors.muted }]}>{watching
          ? 'The projects open in Vibyra on your computer. Tap a terminal to watch it.'
          : 'Shared folders from your computer.'}</Text>
      </>}
    </ScrollView>
    <ReviewSheet visible={!!review} project={review} workspace={workspace} onClose={() => setReview(undefined)} />
  </>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 35 },
  host: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 }, hostText: { flex: 1, fontSize: 12 },
  notice: { gap: 13, marginTop: 18 },
  search: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 13, marginTop: 20 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15 },
  list: { gap: 10 },
  note: { fontSize: 12, lineHeight: 19, marginTop: 20, paddingHorizontal: 3 },
});
