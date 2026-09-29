import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { styles as s } from './FocusDrawerStyles';
import { Icon, type IconName } from './primitives';

export function DrawerProjectBranch({ label, icon, selected, expanded, count, running, onPress,
  onExpand, onLongPress, children }: {
  label: string;
  icon: IconName;
  selected: boolean;
  expanded: boolean;
  count: number;
  running?: boolean;
  onPress(): void;
  onExpand(): void;
  onLongPress?: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return <View style={s.group}>
    <View style={[s.project, { backgroundColor: selected ? colors.elevated : 'transparent' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint="Open this project's current terminal. Hold for project options."
      accessibilityState={{ selected }} aria-selected={selected}
      onPress={onPress} onLongPress={onLongPress}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Show options' }] : undefined}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onLongPress?.(); }}
      style={({ pressed }) => [s.projectMain, pressed && { opacity: 0.65 }]}>
      <View style={s.projectIcon}><Icon name={icon} size={18} color={selected ? colors.text : colors.muted} /></View>
      <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{label}</Text>
      {running && <View style={[s.live, { backgroundColor: colors.success }]} />}
      {count > 0 && <Text style={[s.count, { color: colors.muted }]}>{count}</Text>}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} sessions in ${label}`}
      accessibilityState={{ expanded }} aria-expanded={expanded} onPress={onExpand} style={s.projectControl}>
      <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.muted} />
    </Pressable>
    </View>
    {expanded && <View style={s.sessions}>{children}</View>}
  </View>;
}
