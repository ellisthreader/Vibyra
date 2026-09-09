import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

export function PathCard({ icon, title, detail, badge, selected, onPress }: {
  icon: IconName; title: string; detail: string; badge?: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={[detail, badge].filter(Boolean).join(' ')}
    aria-checked={selected} accessibilityState={{ checked: selected }} onPress={onPress}
    style={({ pressed }) => [s.card, { backgroundColor: pressed ? colors.elevated : colors.surface,
      borderColor: selected ? colors.accent : colors.border }]}>
    <View style={s.top}>
      <View style={[s.tile, { backgroundColor: selected ? colors.accentSoft : colors.elevated }]}>
        <Icon name={icon} size={23} color={selected ? colors.accent : colors.muted} />
      </View>
      {badge && <Text style={[s.badge, { color: colors.muted }]}>{badge}</Text>}
      <View style={[s.check, { borderColor: selected ? colors.action : colors.border,
        backgroundColor: selected ? colors.action : 'transparent' }]}>
        {selected && <Icon name="checkmark" size={15} color={colors.onAction} />}
      </View>
    </View>
    <View style={s.copy}>
      <Text style={[s.title, { color: colors.text }]}>{title}</Text>
      <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
    </View>
  </Pressable>;
}
const s = StyleSheet.create({
  card: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badge: { flex: 1, fontSize: 12, fontWeight: '500' },
  check: { marginLeft: 'auto', width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 7 }, title: { fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.4 },
  detail: { fontSize: 14, lineHeight: 20 },
});
