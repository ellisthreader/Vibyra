import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';
import { APP_HEADER_HEIGHT } from './keyboardOffset';
import type { Destination, Session, WorkspaceModel } from './types';

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
  work: 'Vibyra', projects: 'Projects', integrations: 'Integrations',
  computers: 'Remote', settings: 'Settings',
  // The wallet takes the whole screen and closes with its own X, so it never
  // renders under this header. Named anyway to keep the map total.
  vibes: 'Vibyra tokens',
};

export function AppHeader({ destination, workspace, session, connected, compact, onMenu, onNewChat, onSwitchChat, onComputers }: {
  destination: Destination; workspace: WorkspaceModel; session: Session | undefined;
  connected: boolean; compact: boolean; onMenu: () => void; onNewChat: () => void;
  onSwitchChat: () => void; onComputers: () => void;
}) {
  return <View style={[s.header, compact && { minHeight: 44, paddingVertical: 0 }]}>
    <IconButton icon="menu-outline" label="Open navigation menu" onPress={onMenu} />
    {destination === 'work'
      ? <WorkTitle workspace={workspace} session={session} connected={connected} compact={compact}
        onSwitchChat={onSwitchChat} onComputers={onComputers} />
      : <PageTitle title={titles[destination]} />}
    <Action destination={destination} workspace={workspace} connected={connected} onNewChat={onNewChat} />
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
 * The chat surface. Phone only, the title is just the app's name: a computer is
 * not mentioned until one is actually connected, and then the header is where
 * you see it — tappable, because the thing it names is also the thing you switch.
 */
function WorkTitle({ workspace, session, connected, compact, onSwitchChat, onComputers }: {
  workspace: WorkspaceModel; session: Session | undefined; connected: boolean; compact: boolean;
  onSwitchChat: () => void; onComputers: () => void;
}) {
  const { colors } = useTheme();
  if (!connected && !session) return <View style={s.heading}>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.brand, { color: colors.text }]}>{titles.work}</Text>
  </View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={session ? 'Switch chat' : 'Choose computer'}
    onPress={() => session ? onSwitchChat() : onComputers()} style={s.heading}>
    <View style={s.headingRow}>
      <Text numberOfLines={1} style={[s.brand, { color: colors.text }, session && s.sessionTitle]}>{session?.title ?? titles.work}</Text>
      <Icon name="chevron-down" size={12} color={colors.muted} />
    </View>
    {!compact && <View style={s.connection}>
      <View style={[s.dot, { backgroundColor: workspace.demo ? colors.muted : colors.success }]} />
      <Text numberOfLines={1} style={[s.computer, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace' : workspace.host?.name}</Text>
    </View>}
  </Pressable>;
}

/**
 * One action per page, or none. Refresh belongs to Projects because the list is
 * the computer's answer and can go stale; the pages that only show what the
 * account already holds have nothing here to press.
 */
function Action({ destination, workspace, connected, onNewChat }: {
  destination: Destination; workspace: WorkspaceModel; connected: boolean; onNewChat: () => void;
}) {
  if (destination === 'work') return <IconButton icon="create-outline" label="New chat" onPress={onNewChat} />;
  if (destination === 'projects') return <IconButton icon="refresh-outline" label="Refresh projects"
    disabled={!connected || !!workspace.syncing}
    onPress={() => void workspace.actions.refresh().catch(() => {})} />;
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
