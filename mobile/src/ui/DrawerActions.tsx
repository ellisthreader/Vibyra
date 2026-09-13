import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { Icon } from './primitives';

/**
 * The rail's two standing actions. They float over the Recents list rather than
 * sitting in a footer column, so the list keeps the full height of the panel and
 * scrolls underneath them. A short fade to the rail colour sits behind them, which
 * is what stops a chat title from colliding with the buttons as it passes.
 */
export function DrawerActions({ bottom, settingsSelected, onChat, onSettings }: {
  bottom: number; settingsSelected: boolean; onChat: () => void; onSettings: () => void;
}) {
  const { colors, dark } = useTheme();
  return <>
    <View pointerEvents="none" style={[s.fade, { height: bottom + 78 }]}>
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
    <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={onChat}
      style={({ pressed }) => [s.chat, { bottom, backgroundColor: colors.action, opacity: pressed ? 0.85 : 1,
        shadowColor: dark ? '#000' : colors.action }]}>
      <Icon name="chatbubble-outline" size={19} color={colors.onAction} />
      <Text style={[s.chatText, { color: colors.onAction }]}>Chat</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Settings"
      accessibilityState={{ selected: settingsSelected }} onPress={onSettings}
      style={({ pressed }) => [s.settings, { bottom, backgroundColor: settingsSelected || pressed ? colors.elevated : colors.surface,
        borderColor: colors.border, shadowColor: '#000' }]}>
      <Icon name="settings-outline" size={20} color={settingsSelected ? colors.accent : colors.muted} />
    </Pressable>
  </>;
}
const s = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { position: 'absolute', left: 16, minHeight: 46, borderRadius: 23, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  chatText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  settings: { position: 'absolute', right: 16, width: 46, height: 46, borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
