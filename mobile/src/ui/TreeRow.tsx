import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon, type IconName } from './primitives';
import type { RailState } from './RailRow';

/**
 * A chat or terminal inside a project on the rail: a small glyph, its title and,
 * on the right, the state dot the whole app uses (green working, amber waiting on
 * you, red stopped short, nothing at rest). One row for both kinds, so a project
 * reads as one list of the things open in it.
 */
export function TreeRow({
  icon,
  label,
  selected,
  state = null,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
  busy,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  state?: RailState;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress(): void;
  onLongPress?: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const tone =
    state === 'running'
      ? colors.success
      : state === 'input'
        ? colors.warning
        : state === 'stopped'
          ? colors.error
          : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      aria-selected={selected}
      accessibilityState={{ selected, busy }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: selected || pressed ? colors.elevated : 'transparent' },
      ]}
    >
      <Icon name={icon} size={15} color={selected ? colors.text : colors.muted} />
      <Text
        numberOfLines={1}
        style={[s.label, { color: selected ? colors.text : colors.muted }, selected && s.selected]}
      >
        {label}
      </Text>
      {tone && <View style={[s.dot, { backgroundColor: tone }]} />}
    </Pressable>
  );
}

/** The quiet "+ New chat" at the foot of a project's list. */
export function TreeAction({
  label,
  title,
  onPress,
}: {
  label: string;
  title: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name="add" size={16} color={colors.accent} />
      <Text style={[s.label, s.action, { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  label: { ...font.subhead, fontSize: 14.5, flex: 1 },
  selected: { fontWeight: '500' },
  action: { fontWeight: '500' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
