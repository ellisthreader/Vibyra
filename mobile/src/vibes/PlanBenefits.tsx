import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { Benefit } from './plans';

export function PlanBenefits({ title, benefits }: { title: string; benefits: Benefit[] }) {
  const { colors } = useTheme();
  return <View style={s.list}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.muted }]}>{title}</Text>
    {benefits.map(benefit => <View key={benefit.label} style={s.row}
      accessible accessibilityLabel={[benefit.label, benefit.status, benefit.detail].filter(Boolean).join('. ')}>
      <View style={[s.tile, { backgroundColor: colors.accentSoft }]}><Icon name={benefit.icon} size={17} color={colors.accent} /></View>
      <View style={s.copy}>
        <View style={s.heading}>
          <Text style={[s.label, { color: colors.text }]}>{benefit.label}</Text>
          {benefit.status && <Text style={[s.status, { color: colors.muted, borderColor: colors.border }]}>{benefit.status}</Text>}
        </View>
        {benefit.detail && <Text style={[s.detail, { color: colors.muted }]}>{benefit.detail}</Text>}
      </View>
    </View>)}
  </View>;
}
const s = StyleSheet.create({
  list: { gap: 15 },
  title: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  row: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  tile: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  copy: { flex: 1, gap: 3 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  status: { fontSize: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  detail: { fontSize: 13, lineHeight: 19 },
});
