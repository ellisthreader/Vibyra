import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import type { SessionStatus as Model } from './sessionState';

/** One quiet line between the context row and the terminal, only while there is something to say. */
export function SessionStatus({ model, busy, onReconnect, onTakeControl }: {
  model: Model; busy: boolean; onReconnect?: () => void; onTakeControl?: () => void;
}) {
  const { colors } = useTheme();
  if (model.hidden) return null;
  const warning = model.tone === 'warning';
  const action = model.action === 'reconnect' ? { label: 'Reconnect', name: 'Reconnect to this computer', press: onReconnect }
    : model.action === 'takeControl' ? { label: 'Take control', name: 'Take control of this terminal', press: onTakeControl } : null;
  return <View style={[s.strip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
    <View style={[s.dot, { backgroundColor: warning ? colors.warning : colors.muted }]} />
    <Text numberOfLines={2} accessibilityLiveRegion="polite" style={[s.text, { color: warning ? colors.warning : colors.muted }]}>{model.text}</Text>
    {action?.press && <Pressable accessibilityRole="button" accessibilityLabel={action.name} disabled={busy} onPress={action.press}
      style={({ pressed }) => [s.action, { backgroundColor: colors.action, opacity: pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.onAction} size="small" /> :
        <Text style={[s.actionText, { color: colors.onAction }]}>{action.label}</Text>}
    </Pressable>}
  </View>;
}

/** Floats over a terminal the reader has scrolled up: one tap back to the newest line. */
export function LatestPill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Jump to the latest output" onPress={onPress}
    style={({ pressed }) => [s.pill, { backgroundColor: colors.elevated, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
    <Icon name="arrow-down" size={14} color={colors.text} />
    <Text style={[s.pillText, { color: colors.text }]}>Latest</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  strip: { minHeight: 40, paddingLeft: 20, paddingRight: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  action: { minHeight: 30, paddingHorizontal: 12, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12.5, fontWeight: '600' },
  pill: { position: 'absolute', right: 14, bottom: 12, minHeight: 34, paddingLeft: 10, paddingRight: 13, borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { fontSize: 12.5, fontWeight: '600' },
});
