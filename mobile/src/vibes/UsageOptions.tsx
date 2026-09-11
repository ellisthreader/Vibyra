import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { planNames } from './plans';
import type { VibesProduct } from './types';

/**
 * The plans as how much work they buy, side by side. The allowance is the headline
 * because it is the only figure here the backend actually grants; the plan name and
 * the price sit under it, so a card reads as an amount with a cost rather than a
 * name with a number attached.
 *
 * It used to headline a multiple of the free grant — "3.5×" against 100 free Vibes
 * — which stopped meaning anything once the trial became a taste rather than a unit
 * of work. The same arithmetic against a three-Vibe trial prints "117×", which
 * flatters nothing and tells a buyer less than "350" does.
 *
 * The headline says "2,000", not "2,000 a month": three cards across a 375pt screen
 * leave roughly 83pt inside each one, so the figure is fitted to that width rather
 * than allowed to wrap and drop the price off the baseline the other cards share.
 * The section heading already says each month.
 */
export function UsageOptions({ offers, selected, priceOf, disabled, onSelect }: {
  offers: VibesProduct[]; selected: string | null; priceOf(id: string): string | undefined;
  disabled?: boolean; onSelect(plan: string | null): void;
}) {
  const { colors } = useTheme();
  // A lone offer is not a choice, so it does not get a choice's full width: three
  // cards share the row, one sits at the width one card would have had. Stretched
  // across the page it was a 130pt box with a single figure floating in it.
  return <View style={[s.row, offers.length === 1 && s.only]}>
    {offers.map(offer => {
      const active = offer.plan === selected;
      const price = priceOf(offer.id);
      const name = planNames[offer.plan ?? ''] ?? offer.plan ?? '';
      return <Pressable key={offer.id} accessibilityRole="radio"
        accessibilityLabel={`${name}, ${offer.credits} Vibes a month`}
        accessibilityHint={price ? `${price} per month` : undefined}
        aria-checked={active} accessibilityState={{ checked: active, disabled }} disabled={disabled}
        onPress={() => onSelect(offer.plan)}
        style={({ pressed }) => [s.option, { borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surface, opacity: !active && pressed ? 0.7 : 1 }]}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
          style={[s.times, { color: active ? colors.accent : colors.text }]}>{offer.credits.toLocaleString()}</Text>
        <Text style={[s.usage, { color: colors.muted }]}>Vibes</Text>
        <Text numberOfLines={1} style={[s.allowance, { color: colors.text }]}>{name}</Text>
        <Text style={[s.price, { color: colors.muted }]}>{price ?? 'a month'}</Text>
      </Pressable>;
    })}
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  only: { alignSelf: 'center', width: 180, maxWidth: '100%' },
  option: { flex: 1, borderWidth: 1.5, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  times: { fontSize: 26, fontWeight: '600', letterSpacing: -1.2, fontVariant: ['tabular-nums'], alignSelf: 'stretch', textAlign: 'center' },
  usage: { fontSize: 13, marginTop: -2 },
  allowance: { fontSize: 13, fontWeight: '500', marginTop: 10 },
  price: { fontSize: 13, marginTop: 2 },
});
