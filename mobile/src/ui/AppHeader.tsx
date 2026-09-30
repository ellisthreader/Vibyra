import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';
import { isIdeas } from './ideas';
import { APP_HEADER_HEIGHT } from './keyboardOffset';
import { font } from './font';
import type { Destination, Project, Session, WorkspaceModel } from './types';

/**
 * The one header the whole app sits under. Its middle always answers "where am
 * I?" — on a page that is the page's name, and on the chat surface it is the
 * chat, the computer, or, with neither yet, the app. No screen below draws a
 * title of its own, so a place is named exactly once and always in one spot.
 *
 * The right slot carries actions for the current page. Where a page has no
 * action the slot still holds its width, because a title that
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
  onSessionOptions, onPreview, modeSwitch, onBack }: {
  modeSwitch?: ReactNode;
  destination: Destination; workspace: WorkspaceModel; session: Session | undefined;
  /** The project you are in, named here while no terminal of its own is open. */
  project?: Project;
  connected: boolean; compact: boolean; onMenu: () => void; onNewChat: () => void;
  onSwitchChat: () => void; onComputers: () => void;
  /** Given while a terminal session is open: its ⋯ takes the action slot, so nothing else needs a row of its own. */
  onSessionOptions?: () => void;
  onPreview?: () => void;
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
    <View style={s.slot} />
    <View style={s.trailing}><Action destination={destination} onNewChat={onNewChat} onSessionOptions={onSessionOptions} onPreview={onPreview} /></View>
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
 * The work surface, which is always inside a project. Chats has no computer
 * line — a computer is not mentioned until one is actually
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
      {!session && project && <Icon name={ideas ? 'chatbubbles-outline' : 'folder'} size={15} color={colors.accent} />}
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
 * Keep actions outside the centered title/Code–Agents layout. A new chat stays
 * in the menu while a terminal is open.
 */
function Action({ destination, onNewChat, onSessionOptions, onPreview }: {
  destination: Destination; onNewChat: () => void; onSessionOptions?: () => void; onPreview?: () => void;
}) {
  const { colors } = useTheme();
  if (destination === 'work' && onPreview) return <View style={s.actions}>
    <Pressable accessibilityRole="button" accessibilityLabel="Live Preview" onPress={onPreview} style={s.preview}>
      <Icon name="globe-outline" size={22} color={colors.accent} />
    </Pressable>
    {onSessionOptions && <IconButton icon="ellipsis-horizontal" label="Session options" onPress={onSessionOptions} />}
  </View>;
  if (destination === 'work' && onSessionOptions) return <IconButton icon="ellipsis-horizontal" label="Session options" onPress={onSessionOptions} />;
  if (destination === 'work') return <IconButton icon="create-outline" label="New chat" onPress={onNewChat} />;
  return <View style={s.slot} />;
}

const s = StyleSheet.create({
  header: { minHeight: APP_HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8, paddingVertical: 6 },
  heading: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  brand: { ...font.headline, flexShrink: 1 },
  sessionTitle: { fontSize: 16, letterSpacing: -0.3 },
  page: { ...font.headline, flexShrink: 1 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  computer: { fontSize: 11, fontWeight: '500', flexShrink: 1 },
  // Matches the icon button's width so the title stays centred on pages with no action.
  slot: { width: 44 },
  trailing: { position: 'absolute', right: 8, top: 6, flexDirection: 'row' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  preview: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
