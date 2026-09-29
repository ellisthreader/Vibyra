import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

/** The compact action of a Preview card. A primary that
 *  cannot be used yet goes neutral, like every other button in the app. */
export function RunPill({ title, label = title, icon, secondary, busy, disabled, wide, grow = 1, onPress }: {
  title: string; onPress(): void; label?: string; icon?: IconName;
  secondary?: boolean; busy?: boolean; disabled?: boolean;
  /** Fills a row of actions; `grow` is its share of the row. */
  wide?: boolean; grow?: number;
}) {
  const { colors } = useTheme();
  const quiet = secondary || disabled;
  const ink = secondary ? colors.text : disabled ? colors.muted : colors.onAction;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} aria-busy={busy} aria-disabled={disabled || busy}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    hitSlop={wide ? undefined : { top: 4, bottom: 4, left: 4, right: 4 }}
    style={({ pressed }) => [s.pill, wide && s.wide, wide && { flexGrow: grow }, { backgroundColor: quiet ? colors.elevated : colors.action,
      opacity: secondary && disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
    {busy ? <ActivityIndicator size="small" color={ink} /> : <>
      {icon && <Icon name={icon} size={wide ? 19 : 17} color={ink} />}
      <Text style={[s.text, { color: ink }]}>{title}</Text>
    </>}
  </Pressable>;
}

const s = StyleSheet.create({
  pill: { minHeight: 38, minWidth: 78, borderRadius: 19, paddingHorizontal: 18, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 7 },
  wide: { flexBasis: 0, minHeight: 48, borderRadius: 14 },
  text: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
});
