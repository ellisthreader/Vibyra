import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CloudComputer, CloudComputers as Listing } from '../remote/remoteApi';
import { useTheme } from '../theme';
import { describePlatform } from '../ui/hostIdentity';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { font } from '../ui/font';

// Presence is what the relay last said; a computer that just woke shows up on
// the next refresh, so the list keeps itself fresh while it is on screen.
const REFRESH = 15000;

/** The computers this account can reach through Vibyra Cloud, from any network.
 *  Only ever shown signed in and only once the account lists one; a phone with
 *  nothing here sees the install-and-find flow exactly as before. Tapping a
 *  computer that is online goes to the same connecting page a nearby computer
 *  does, because after the relay it *is* the same connection: the computer's
 *  own key is pinned and it approves this phone once. */
export function CloudComputers({
  workspace,
  onSelect,
}: {
  workspace: WorkspaceModel;
  onSelect: (computer: CloudComputer) => void;
}) {
  const { colors } = useTheme();
  const list = workspace.actions.listComputers;
  const signedIn = Boolean(workspace.account) && Boolean(list);
  const [listing, setListing] = useState<Listing>();
  useEffect(() => {
    if (!signedIn || !list) {
      setListing(undefined);
      return;
    }
    let live = true;
    const refresh = () => {
      list().then(
        (next) => {
          if (live) setListing(next);
        },
        () => {},
      );
    };
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, REFRESH);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [signedIn, list]);
  if (!listing?.live || !listing.computers.length) return null;
  return (
    <View style={s.block}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
        Your computers
      </Text>
      <Text style={[s.detail, { color: colors.muted }]}>
        {listing.entitled
          ? 'Signed in on these. Reach one from any network.'
          : 'Connecting from anywhere is part of Pro. On the same Wi-Fi, find your computer below.'}
      </Text>
      <View style={[s.rows, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {listing.computers.map((computer, index) => (
          <Row
            key={computer.id}
            computer={computer}
            first={index === 0}
            onPress={() => onSelect(computer)}
          />
        ))}
      </View>
    </View>
  );
}

/** One computer: its name, its family's mark, and whether it is there to be
 *  reached. An offline computer stays in the list so the person knows the
 *  account has it — and why nothing happens until it is opened and awake. */
function Row({
  computer,
  onPress,
  first,
}: {
  computer: CloudComputer;
  onPress: () => void;
  first: boolean;
}) {
  const { colors } = useTheme();
  const platform = describePlatform(computer.platform ?? undefined);
  const state = computer.online
    ? computer.activeSessions
      ? 'Online · a phone is connected'
      : 'Online'
    : `Offline${computer.lastSeenAt ? ` · seen ${since(computer.lastSeenAt)}` : ''}`;
  const label = computer.online ? `Connect to ${computer.name}` : `${computer.name} is offline`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        computer.online ? undefined : 'Open Vibyra on that computer and keep it awake.'
      }
      accessibilityState={{ disabled: !computer.online }}
      disabled={!computer.online}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        { backgroundColor: pressed ? colors.elevated : 'transparent' },
      ]}
    >
      <View style={[s.mark, { backgroundColor: colors.elevated }]}>
        <Icon name={platform.icon} size={19} color={computer.online ? colors.text : colors.muted} />
      </View>
      <View style={s.text}>
        <Text
          numberOfLines={1}
          style={[s.name, { color: computer.online ? colors.text : colors.muted }]}
        >
          {computer.name}
        </Text>
        <View style={s.stateRow}>
          <View
            style={[s.dot, { backgroundColor: computer.online ? colors.success : colors.border }]}
          />
          <Text numberOfLines={1} style={[s.state, { color: colors.muted }]}>
            {state}
          </Text>
        </View>
      </View>
      {computer.online && <Icon name="chevron-forward" size={16} color={colors.muted} />}
    </Pressable>
  );
}

/** "3m ago", "2h ago", "4d ago" — coarse on purpose; presence is only as
 *  exact as the relay's last word. */
export function since(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return 'a while ago';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

const s = StyleSheet.create({
  block: { gap: 4 },
  title: { ...font.headline },
  detail: { ...font.subhead },
  rows: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: 10,
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mark: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  state: { fontSize: 13, flexShrink: 1 },
});
