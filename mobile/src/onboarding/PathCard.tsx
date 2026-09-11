import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';
import { PathDevice } from './PathDevice';

export function PathCard({ icon, title, detail, badge, selected, onPress }: {
  icon: IconName; title: string; detail: string; badge?: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={[detail, badge].filter(Boolean).join(' ')}
    aria-checked={selected} accessibilityState={{ checked: selected }} onPress={onPress}
    style={({ pressed }) => [s.card, { backgroundColor: pressed ? colors.elevated : colors.surface,
      borderColor: selected ? colors.accent : colors.border, shadowColor: colors.text,
      transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
    <View style={s.top}>
      <PathDevice phone={icon === 'phone-portrait-outline'} selected={selected} />
      {badge && <View style={[s.badgeWrap, { backgroundColor: selected ? colors.accentSoft : colors.elevated }]}>
        <Text style={[s.badge, { color: selected ? colors.accent : colors.muted }]}>{badge}</Text>
      </View>}
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
  card: { padding: 22, borderRadius: 24, borderWidth: 1, gap: 14,
    shadowOpacity: 0.035, shadowRadius: 16, shadowOffset: { width: 0, height: 5 } },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgeWrap: { flexShrink: 1, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 7 },
  badge: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  check: { marginLeft: 'auto', width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 6 }, title: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.6 },
  detail: { fontSize: 14, lineHeight: 20 },
});
