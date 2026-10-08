import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { styles as s } from './FocusDrawerStyles';
import { Icon, type IconName } from './primitives';

export function DrawerProjectBranch({ label, icon, selected, expanded, count, running, onPress,
  onLongPress, children }: {
  label: string;
  icon: IconName;
  selected: boolean;
  expanded: boolean;
  count: number;
  running?: boolean;
  onPress(): void;
  onLongPress?: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return <View style={s.group}>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Tap to show or hide sessions. Hold for workspace options.' : 'Tap to show or hide chats.'}
      accessibilityState={{ expanded, selected }} aria-expanded={expanded} aria-selected={selected}
      onPress={onPress} onLongPress={onLongPress}
      style={({ pressed }) => [s.project, { backgroundColor: selected || pressed ? colors.elevated : 'transparent' }]}>
      <View style={s.projectIcon}><Icon name={icon} size={18} color={selected ? colors.text : colors.muted} /></View>
      <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{label}</Text>
      {running && <View style={[s.live, { backgroundColor: colors.success }]} />}
      {count > 0 && <Text style={[s.count, { color: colors.muted }]}>{count}</Text>}
      <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.muted} />
    </Pressable>
    {expanded && <View style={s.sessions}>{children}</View>}
  </View>;
}
