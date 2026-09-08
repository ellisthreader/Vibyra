import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

export function PathCard({ icon, title, detail, meta, badge, selected, onPress }: {
  icon: IconName; title: string; detail: string; meta: string; badge?: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} aria-checked={selected} accessibilityState={{ checked: selected }}
    onPress={onPress} style={({ pressed }) => [s.card, { backgroundColor: selected ? colors.accentSoft : colors.surface,
      borderColor: selected ? colors.accent : colors.border, opacity: pressed ? 0.85 : 1 }]}>
    <View style={[s.tile, { backgroundColor: selected ? colors.accent : colors.elevated }]}>
      <Icon name={icon} size={21} color={selected ? colors.onAction : colors.text} />
    </View>
    <View style={s.text}>
      <Text style={[s.title, { color: colors.text }]}>{title}</Text>
      <Text style={[s.detail, { color: colors.text }]}>{detail}</Text>
      <View style={s.metaRow}>
        {badge && <View style={[s.badge, { backgroundColor: selected ? colors.accent : colors.elevated }]}>
          <Text style={[s.badgeText, { color: selected ? colors.onAction : colors.muted }]}>{badge}</Text></View>}
        <Text style={[s.meta, { color: colors.muted }]}>{meta}</Text>
      </View>
    </View>
    <View style={[s.check, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : 'transparent' }]}>
      {selected && <Icon name="checkmark" size={14} color={colors.onAction} />}
    </View>
  </Pressable>;
}
const s = StyleSheet.create({
  card: { padding: 14, borderRadius: 22, borderWidth: 1.5, flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4, paddingTop: 1 }, title: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  detail: { fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }, badgeText: { fontSize: 11, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 17, flexShrink: 1 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
