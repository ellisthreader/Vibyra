import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { sessionsInProject } from './DrawerProjects';
import { Button, EmptyState, Hint, Icon } from './primitives';
import { ProjectActionsSheet } from './newProject/ProjectActionsSheet';
import { ProjectRow } from './ProjectRow';
import { useAction } from './useAction';
import type { Project, WorkspaceModel } from './types';

/**
 * The computer's folders, one row each, drawn the way Integrations draws its
 * services: a lead sentence, one inset card of rows, nothing else. A row says
 * how much is open in that project — a stack of windows and a number — and
 * tapping it enters the project: its home takes the screen and the rail becomes
 * that project's own, listing its terminals. The terminals used to be drawn on
 * this page as live windows onto their output; that made the page a wall of
 * type in four sizes, and this page is for choosing, not reading.
 *
 * A search reaches terminals as well as folders, so a terminal remembered by
 * name is still found from here, through the folder holding it.
 */
export function ProjectsScreen({ workspace, onConnect, onOpen, onNew }: {
  workspace: WorkspaceModel; onConnect: () => void; onOpen: (projectId: string) => void;
  /** Opens the New project sheet. Offered only where the computer can build one. */
  onNew?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  // A paired Vibyra Desktop shows the projects it is working in and refuses
  // every request that would change them, so this page watches rather than acts.
  const watching = workspace.viewOnly === true;
  const host = workspace.host?.name ?? 'your computer';
  const term = query.trim().toLowerCase();
  // Live terminals lead, then the most recent, so the one you are likely to want
  // is first in the stack and first in the sheet rather than wherever the host
  // listed it. The rail orders a project's terminals the same way, from the same helper.
  const sessionsOf = (id: string) => sessionsInProject(workspace.sessions, id);
  const matches = (project: Project) => !term || project.name.toLowerCase().includes(term)
    || sessionsOf(project.id).some(session => session.title.toLowerCase().includes(term));
  const projects = workspace.projects.filter(matches);
  const activeProjectId = workspace.sessions.find(session => session.id === workspace.selectedSessionId)?.projectId;
  const searchable = workspace.projects.length > 3 || workspace.sessions.length > 4;
  // Why this computer cannot start one, or null when it can. The button is drawn
  // either way: a control that simply vanishes reads as a feature nobody wrote,
  // when the answer people need is which computer to ask.
  //
  // The computer's own answer decides it, not whether this is a watched Desktop.
  // A Desktop refuses everything else a phone could change, and still builds a
  // project: the folder is new, so there is nothing of the person's to overwrite,
  // and the window is what opens it afterwards.
  const createReason = workspace.scaffoldAvailable === true ? null
    : `Update Vibyra on ${host} to start projects from your phone.`;
  const canCreate = connected && Boolean(onNew);
  // Renaming a project, and dropping it from the list, are the computer's to
  // allow: a watched Desktop with typing off refuses both.
  const canManage = connected && workspace.actions.renameProject !== undefined
    && workspace.actions.forgetProject !== undefined && (!watching || workspace.canManage === true);
  const chosen = workspace.projects.find(project => project.id === optionsFor) ?? null;
  return <View style={s.page}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      indicatorStyle={colors.text === '#F5F7FA' ? 'white' : 'black'}
      refreshControl={<RefreshControl refreshing={busy || !!workspace.syncing} tintColor={colors.accent}
        onRefresh={() => void run(workspace.actions.refresh)} enabled={connected} />}>
      {connected && <Text style={[s.lead, { color: colors.muted }]}>{watching
        ? `The projects open in Vibyra on ${host}.` : `Folders on ${host} and the terminals in each.`}</Text>}
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
            : 'Add a folder in Vibyra Host on your computer.'} />
        : <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {projects.map((project, index) => <View key={project.id}>
            {/* Inset to the text column, so the tiles read as one stack rather than a table. */}
            {index > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
            <ProjectRow project={project} sessions={sessionsOf(project.id)} active={project.id === activeProjectId}
              onPress={() => onOpen(project.id)}
              onOptions={canManage ? () => setOptionsFor(project.id) : undefined} />
          </View>)}
        </View>}
    </ScrollView>
    {canCreate && createReason && <Text style={[s.reason, { color: colors.muted, bottom: insets.bottom + 76 }]}>{createReason}</Text>}
    {canCreate && <Pressable accessibilityRole="button" accessibilityLabel="New project"
      accessibilityHint={createReason ?? `Starts a project on ${host}`}
      accessibilityState={{ disabled: createReason !== null }} aria-disabled={createReason !== null}
      disabled={createReason !== null} onPress={onNew!}
      style={({ pressed }) => [s.add, { backgroundColor: colors.action, bottom: insets.bottom + 18,
        opacity: createReason ? 0.4 : pressed ? 0.85 : 1 }]}>
      <Icon name="add" size={24} color={colors.onAction} />
      <Text style={[s.addText, { color: colors.onAction }]}>New project</Text>
    </Pressable>}
    <ProjectActionsSheet project={chosen} host={host} onClose={() => setOptionsFor(null)}
      onRename={name => workspace.actions.renameProject!(chosen!.id, name)}
      onForget={() => workspace.actions.forgetProject!(chosen!.id)} />
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1 },
  // Bottom left, clear of the list's own scroll, and a pill rather than a
  // circle: the words are what say it starts a project rather than adds a row.
  add: { position: 'absolute', left: 20, flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 50, paddingLeft: 14, paddingRight: 20, borderRadius: 25 },
  addText: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 },
  reason: { position: 'absolute', left: 20, right: 20, fontSize: 13, lineHeight: 18 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 104 },
  lead: { fontSize: 15, lineHeight: 22 },
  notice: { gap: 13, marginTop: 16 },
  search: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 13, marginTop: 18 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginTop: 22 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 73 },
});
