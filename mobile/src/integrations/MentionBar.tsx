import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { integrationBrand } from './integrationBrands';
import type { Integration } from './types';

/**
 * The suggestions shown while an `@` is being typed. It exists only while there is
 * something to choose, so the composer keeps its full height the rest of the time:
 * the toolbar below it has no room left for another permanent control, which is
 * why the reference is typed rather than picked from a chip.
 *
 * Taps must survive the keyboard, hence `keyboardShouldPersistTaps`; without it the
 * first tap only dismisses the keyboard and the mention is never inserted.
 */
export function MentionBar({ integrations, onChoose }: { integrations: Integration[]; onChoose(id: string): void }) {
  const { colors } = useTheme();
  if (!integrations.length) return null;
  return <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}
    contentContainerStyle={s.row} style={s.bar}>
    {integrations.map(integration => <Pressable key={integration.id} accessibilityRole="button" accessibilityLabel={'Mention ' + integration.name}
      onPress={() => onChoose(integration.id)}
      style={({ pressed }) => [s.chip, { backgroundColor: colors.elevated, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <Mark brand={integrationBrand(integration.id)} size={20} />
      <Text style={[s.name, { color: colors.text }]}>{integration.mention}</Text>
    </Pressable>)}
  </ScrollView>;
}
const s = StyleSheet.create({
  bar: { flexGrow: 0, marginBottom: 8 },
  row: { gap: 8, paddingRight: 8 },
  chip: { minHeight: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 8, paddingRight: 13,
    flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 13, fontWeight: '500' },
});
