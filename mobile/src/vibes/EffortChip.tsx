import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';

/** How hard the model thinks, as the right half of the composer's model pill. */
export function EffortChip({ label, level, automatic = false, open = false, onPress, onPressIn }: {
  label: string; level: number; automatic?: boolean; open?: boolean; onPress(): void; onPressIn?(): void;
}) {
  const { colors } = useTheme();
  const set = level > 0;
  return <Pressable accessibilityRole="button" onPointerDown={Platform.OS === 'web' ? onPressIn : undefined}
    onPressIn={Platform.OS !== 'web' ? onPressIn : undefined} onPress={onPress} accessibilityState={{ expanded: open }} aria-expanded={open}
    accessibilityLabel={automatic ? `Thinking effort, ${label}, chosen automatically` : `Thinking effort, ${label}`}
    style={({ pressed }) => [s.chip, { backgroundColor: open ? colors.accentSoft : 'transparent', opacity: pressed ? 0.6 : 1 }]}>
    <Icon name="pulse-outline" size={14} color={set ? colors.accent : colors.muted} />
    <Text numberOfLines={1} style={[s.label, { color: set ? colors.text : colors.muted }]}>{label}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  chip: { height: 34, borderRadius: 17, flexDirection: 'row', gap: 4, paddingLeft: 8, paddingRight: 10, alignItems: 'center', flexShrink: 0 },
  label: { fontSize: 13, fontWeight: '500' },
});
