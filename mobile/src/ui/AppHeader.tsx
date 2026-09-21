import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';
import { isIdeas } from './ideas';
import { APP_HEADER_HEIGHT } from './keyboardOffset';
import type { Destination, Project, Session, WorkspaceModel } from './types';

/**
 * The one header the whole app sits under. Its middle always answers "where am
 * I?" — on a page that is the page's name, and on the chat surface it is the
 * chat, the computer, or, with neither yet, the app. No screen below draws a
 * title of its own, so a place is named exactly once and always in one spot.
 *
 * The right slot carries whatever that page can do and nothing else. Where a
 * page has no action the slot still holds its width, because a title that
 * shifts sideways between pages reads as a different bar rather than the same
 * one with a different name.
 */
const titles: Record<Destination, string> = {
  work: 'Vibyra', integrations: 'Integrations',
  computers: 'Remote',
  // The wallet takes the whole screen and closes with its own X, so it never
  // renders under this header. Named anyway to keep the map total.
  vibes: 'Vibyra tokens',
};

export function AppHeader({ destination, workspace, session, project, connected, compact, onMenu, onNewChat, onSwitchChat, onComputers,
  onSessionOptions, modeSwitch, onBack }: {
  modeSwitch?: ReactNode;
  destination: Destination; workspace: WorkspaceModel; session: Session | undefined;
  /** The project you are in, named here while no terminal of its own is open. */
  project?: Project;
  connected: boolean; compact: boolean; onMenu: () => void; onNewChat: () => void;
  onSwitchChat: () => void; onComputers: () => void;
  /** Given while a terminal session is open: its ⋯ takes the action slot, so nothing else needs a row of its own. */
  onSessionOptions?: () => void;
  /** Given while Settings led here: the leading button returns to Settings instead of opening the menu. */
  onBack?: () => void;
}) {
  return <View style={[s.header, compact && { minHeight: 44, paddingVertical: 0 }]}>
    {onBack ? <IconButton icon="chevron-back" label="Back to Settings" onPress={onBack} />
      : <IconButton icon="menu-outline" label="Open navigation menu" onPress={onMenu} />}
    {modeSwitch ? <View style={s.heading}>{modeSwitch}</View> : destination === 'work'
      ? <WorkTitle workspace={workspace} session={session} project={project} connected={connected} compact={compact}
        onSwitchChat={onSwitchChat} onComputers={onComputers} />
      : <PageTitle title={titles[destination]} />}
    <Action destination={destination} onNewChat={onNewChat} onSessionOptions={onSessionOptions} />
  </View>;
}

/** A page's name, and only its name. The page below starts at its first useful thing. */
function PageTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return <View style={s.heading}>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.page, { color: colors.text }]}>{title}</Text>
  </View>;
}

/**
 * The work surface, which is always inside a project. Ideas is named with its
 * spark and no computer line — a computer is not mentioned until one is actually
 * connected, and then a folder's title carries it. The title is tappable,
 * because the thing it names is also the thing you switch: the rail opens on
 * that project's chats and terminals.
 */
function WorkTitle({ workspace, session, project, connected, compact, onSwitchChat, onComputers }: {
  workspace: WorkspaceModel; session: Session | undefined; project?: Project; connected: boolean; compact: boolean;
  onSwitchChat: () => void; onComputers: () => void;
}) {
  const { colors } = useTheme();
  const ideas = !session && isIdeas(project);
  if (!connected && !session && !project) return <View style={s.heading}>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.brand, { color: colors.text }]}>{titles.work}</Text>
  </View>;
  const inside = session || project;
  return <Pressable accessibilityRole="button" accessibilityLabel={session || ideas ? 'Switch chat' : project ? 'Switch terminal' : 'Choose computer'}
    onPress={() => inside ? onSwitchChat() : onComputers()} style={s.heading}>
    <View style={s.headingRow}>
      {!session && project && <Icon name={ideas ? 'sparkles' : 'folder'} size={15} color={colors.accent} />}
      <Text numberOfLines={1} style={[s.brand, { color: colors.text }, session && s.sessionTitle]}>{session?.title ?? project?.name ?? titles.work}</Text>
      <Icon name="chevron-down" size={12} color={colors.muted} />
    </View>
    {!compact && connected && !ideas && <View style={s.connection}>
      <View style={[s.dot, { backgroundColor: workspace.demo ? colors.muted : colors.success }]} />
      <Text numberOfLines={1} style={[s.computer, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace' : workspace.host?.name}</Text>
    </View>}
  </Pressable>;
}

/**
 * One action per page, or none. The work surface offers a new chat; the pages
 * that only show what the account already holds have nothing here to press. An
 * open terminal's one action is its options (project, files, stop): a new chat
 * is a menu away, and the terminal keeps every pixel below this bar for its output.
 */
function Action({ destination, onNewChat, onSessionOptions }: {
  destination: Destination; onNewChat: () => void; onSessionOptions?: () => void;
}) {
  if (destination === 'work' && onSessionOptions) return <IconButton icon="ellipsis-horizontal" label="Session options" onPress={onSessionOptions} />;
  if (destination === 'work') return <IconButton icon="create-outline" label="New chat" onPress={onNewChat} />;
  return <View style={s.slot} />;
}

const s = StyleSheet.create({
  header: { minHeight: APP_HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12, paddingVertical: 7 },
  heading: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  brand: { fontSize: 20, fontWeight: '600', letterSpacing: -0.6, flexShrink: 1 },
  sessionTitle: { fontSize: 15, letterSpacing: -0.2 },
  page: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, flexShrink: 1 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  computer: { fontSize: 10, flexShrink: 1 },
  // Matches the icon button's width so the title stays centred on pages with no action.
  slot: { width: 44 },
});
