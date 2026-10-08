import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme';

/**
 * A compact action inside a hub row. Full-width buttons on every account turned a list of
 * accounts into a wall of buttons; rows keep small pills and the page keeps one primary.
 */
export function HubAction({ title, label = title, onPress, disabled, busy, tone = 'neutral' }: {
  title: string; label?: string; onPress(): void; disabled?: boolean; busy?: boolean; tone?: 'primary' | 'neutral' | 'danger';
}) {
  const { colors } = useTheme();
  const color = tone === 'primary' ? colors.onAction : tone === 'danger' ? colors.error : colors.text;
  const background = tone === 'primary' ? colors.action : tone === 'danger' ? colors.errorSoft : colors.elevated;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} aria-disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [s.pill, { backgroundColor: background, opacity: disabled && !busy ? 0.45 : pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={[s.text, { color }]}>{title}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  pill: { minHeight: 34, borderRadius: 999, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  text: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.1 },
});
