import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { DrawerBalance } from '../vibes/DrawerBalance';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './primitives';
import type { Account } from './types';

/**
 * The rail's two standing actions. They float over the Recents list rather than
 * sitting in a footer column, so the list keeps the full height of the panel and
 * scrolls underneath them. A short fade to the rail colour sits behind them, which
 * is what stops a chat title from colliding with the buttons as it passes.
 *
 * Settings is your own face rather than a gear: it opens the sheet that starts with
 * your profile. It sits at the end of a row, so anything else that belongs beside
 * it goes in the same row, before it — the Vibes balance, which opens Vibyra tokens.
 */
export function DrawerActions({ bottom, account, onChat, onSettings, onBalance, action }: {
  bottom: number; account: Account | null; onChat: () => void; onSettings: () => void; onBalance?: () => void;
  /** What the pinned action starts: a project from the home face, a terminal inside a
   *  folder, a chat inside Ideas. `reason` withholds it and says why, in one quiet line. */
  action?: { title: string; label: string; icon: IconName; reason?: string | null };
}) {
  const { title, label, icon, reason = null } = action ?? { title: 'Chat', label: 'New chat', icon: 'chatbubble-outline' };
  const { colors, dark } = useTheme();
  const blocked = reason !== null;
  return <>
    <View pointerEvents="none" style={[s.fade, { height: bottom + (blocked ? 112 : 78) }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="railFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.rail} stopOpacity="0" />
            <Stop offset="0.45" stopColor={colors.rail} stopOpacity="0.82" />
            <Stop offset="1" stopColor={colors.rail} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#railFade)" />
      </Svg>
    </View>
    {blocked && <Text style={[s.reason, { color: colors.muted, bottom: bottom + 58 }]}>{reason}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={reason ?? undefined}
      accessibilityState={{ disabled: blocked }} aria-disabled={blocked} disabled={blocked} onPress={onChat}
      style={({ pressed }) => [s.chat, { bottom, backgroundColor: colors.action, opacity: blocked ? 0.4 : pressed ? 0.85 : 1,
        shadowColor: dark ? '#000' : colors.action }]}>
      <Icon name={icon} size={19} color={colors.onAction} />
      <Text style={[s.chatText, { color: colors.onAction }]}>{title}</Text>
    </Pressable>
    <View style={[s.trailing, { bottom }]}>
      {onBalance && <DrawerBalance onPress={onBalance} />}
      {/* One circle: the photo fills the button, or a plain person glyph sits in it.
          A lettered avatar inside the button's own ring read as two circles. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings}
        style={({ pressed }) => [s.settings, { backgroundColor: pressed ? colors.elevated : colors.surface,
          borderColor: colors.border, shadowColor: '#000' }]}>
        {account?.avatarUrl
          ? <Avatar name={account.name} email={account.email} uri={account.avatarUrl} size={46} />
          : <Icon name="person-outline" size={21} color={colors.muted} />}
      </Pressable>
    </View>
  </>;
}
const s = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { position: 'absolute', left: 16, minHeight: 46, borderRadius: 23, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  chatText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  reason: { position: 'absolute', left: 18, right: 18, fontSize: 12.5, lineHeight: 17 },
  trailing: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  settings: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
