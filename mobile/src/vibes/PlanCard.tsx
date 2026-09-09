import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { planNames } from './plans';
import type { VibesProduct, VibesWallet } from './types';

export function PlanCard({ product, wallet, price, selected, disabled, onPress }: {
  product: VibesProduct; wallet: VibesWallet; price?: string; selected: boolean; disabled?: boolean; onPress(): void;
}) {
  const { colors } = useTheme();
  const plan = product.plan ?? 'free';
  const name = planNames[plan] ?? plan;
  const allowance = `${product.credits.toLocaleString()} Vibes / month`;
  // Earned from the offer's own entitlements, never a fixed marketing label.
  const e = wallet.planEntitlements[plan];
  const badge = e && e.fullCatalogue && e.maxProjects === null ? 'Everything included' : null;
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${name}, ${product.credits} Vibes per month`}
    accessibilityHint={price ? `${price} per month` : undefined}
    aria-checked={selected} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.card, { backgroundColor: selected || pressed ? colors.surface : 'transparent',
      borderColor: selected ? colors.accent : colors.border }]}>
    <View style={s.top}>
      <Text style={[s.name, { color: colors.text }]}>{name}</Text>
      {badge && <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{badge}</Text>}
      <View style={s.grow} />
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? colors.accent : colors.muted} />
    </View>
    <Text style={[s.allowance, { color: colors.text }]}>{product.credits.toLocaleString()}
      <Text style={s.unit}>{' '}Vibes / month</Text></Text>
    <Text accessibilityLabel={price ? `${price} per month` : allowance} style={[s.price, { color: colors.muted }]}>
      {price ? `${price} / month` : 'Price available in the iPhone app'}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, borderRadius: 20, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '600' }, grow: { flex: 1, minWidth: 4 },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, overflow: 'hidden' },
  allowance: { fontSize: 26, fontWeight: '500', letterSpacing: -0.5 },
  unit: { fontSize: 14, fontWeight: '400', letterSpacing: 0 },
  price: { fontSize: 13 },
});
