import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';
import { RailGroup, RailNote, RailSection } from './RailRow';
import { isIdeas } from './ideas';
import { ProjectTerminalRow } from './ProjectTerminalRow';
import type { Project, Session, WorkspaceModel } from './types';

/**
 * The rail while you are in a project.
 *
 * The column stops being the map of the whole app and becomes the project's
 * own: an accent tile beside its name, where the app's mark and name were, so
 * there is no mistaking which face this is. Under it are the chats in it and
 * the terminals open in that folder. Remote, Integrations and the
 * other projects are not here, because inside a project they are not what you
 * switch between. The one way out is the back arrow, which returns the rail
 * to the projects. Ideas wears the same face with a spark for its tile: it is
 * a project like the others, one that lives on the phone.
 */
export function ProjectHeader({
  project,
  host,
  onBack,
  onOptions,
  onClose,
}: {
  project: Project;
  host: string;
  onBack: () => void;
  onClose: () => void;
  /** What can be done to this folder from the phone: its name here, and whether it is listed. */
  onOptions?: () => void;
}) {
  const { colors } = useTheme();
  const ideas = isIdeas(project);
  return (
    <View style={s.header}>
      <View style={s.row}>
        <IconButton icon="chevron-back" label="Back to projects" onPress={onBack} />
        <View style={s.spacer} />
        {onOptions && (
          <IconButton
            icon="ellipsis-horizontal"
            label={`Options for ${project.name}`}
            onPress={onOptions}
          />
        )}
        <IconButton icon="close" label="Close navigation menu" onPress={onClose} />
      </View>
      <View style={s.identity}>
        <View style={[s.folder, { backgroundColor: colors.accentSoft }]}>
          <Icon name={ideas ? 'chatbubbles-outline' : 'folder'} size={22} color={colors.accent} />
        </View>
        <View style={s.title}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[s.name, { color: colors.text }]}
          >
            {project.name}
          </Text>
          <View style={s.whereRow}>
            <Icon
              name={
                ideas
                  ? 'phone-portrait-outline'
                  : project.branch
                    ? 'git-branch-outline'
                    : 'folder-open-outline'
              }
              size={12}
              color={colors.muted}
            />
            <Text numberOfLines={1} style={[s.where, { color: colors.muted }]}>
              {ideas ? 'Your phone · always here' : `${project.branch ?? project.path} · ${host}`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * What a project holds: the terminals open in it, live first, and nothing else
 * in the list — starting one is the pinned action at the rail's foot. Each
 * terminal is led by the mark of the company whose agent runs it — Anthropic's
 * for Claude Code, OpenAI's for Codex, a terminal tile for a plain shell — and
 * says under its title who that is and how it is going, in the same words the
 * dot beside it means: green working, amber waiting on you, red stopped short,
 * nothing when finished. Files and changes are read from the open terminal's
 * own options, not from here.
 */
export function ProjectTerminals({
  sessions,
  workspace,
  watching,
  onOpenSession,
}: {
  sessions: Session[];
  workspace: WorkspaceModel;
  watching: boolean;
  onOpenSession: (id: string) => void;
}) {
  return (
    <>
      <RailSection>Terminals</RailSection>
      <RailGroup>
        {sessions.length === 0 ? (
          <RailNote>
            {watching
              ? 'No terminals open in this project on your computer.'
              : 'No terminals open yet.'}
          </RailNote>
        ) : (
          sessions.map((session) => (
            <ProjectTerminalRow
              key={session.id}
              session={session}
              workspace={workspace}
              onOpen={() => onOpenSession(session.id)}
            />
          ))
        )}
        {watching && sessions.length > 0 && <RailNote>Tap a terminal to watch it.</RailNote>}
      </RailGroup>
    </>
  );
}
const s = StyleSheet.create({
  header: { paddingBottom: 6 },
  row: { minHeight: 52, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
  },
  folder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, gap: 3 },
  name: { fontSize: 21, fontWeight: '700', letterSpacing: -0.6 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  where: { fontSize: 12.5, flexShrink: 1 },
});
