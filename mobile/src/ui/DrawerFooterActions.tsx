import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from './primitives';

/** Two quiet actions share one row to leave more room for the drawer's content. */
export function DrawerFooterActions({
  onSettings,
  onReport,
}: {
  onSettings(): void;
  onReport?(): void;
}) {
  return (
    <View style={s.actions}>
      {onReport && <FooterAction
        icon="bug-outline"
        label="Report"
        accessibilityLabel="Report a problem"
        onPress={onReport}
      />}
      <FooterAction icon="settings-outline" label="Settings" onPress={onSettings} />
    </View>
  );
}

function FooterAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        { backgroundColor: pressed ? colors.accentSoft : colors.elevated },
      ]}
    >
      <Icon name={icon} size={17} color={colors.muted} />
      <Text numberOfLines={1} style={[s.label, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  label: { fontSize: 13, fontWeight: '500' },
});
