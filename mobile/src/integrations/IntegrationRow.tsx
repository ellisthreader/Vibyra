import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { Icon } from '../ui/primitives';
import { integrationBrand } from './integrationBrands';
import type { Integration } from './types';

/**
 * One integration in the list: its mark, its name, and whichever single fact matters
 * most right now — who it is connected as, or else what it does. One fact rather
 * than two is what lets the row stay unbroken on a small phone; the rest is one tap
 * away on the integration's own page.
 *
 * The mention used to sit at the end of every row on a tinted pill. Three of them
 * down the right-hand edge were three badges to decode before the names could be
 * read, and each one only repeated the name beside it. The "Use it in a chat"
 * button on the integration's own page puts it in a chat instead. What is left on
 * the right is the chevron that says the row opens — with the pills gone, nothing
 * else marked these as tappable.
 */
export function IntegrationRow({ integration, onPress }: { integration: Integration; onPress(): void }) {
  const { colors } = useTheme();
  const detail = integration.installed ? integration.account ? 'Connected as ' + integration.account : 'Connected'
    : integration.tagline;
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${integration.name}, ${integration.installed ? 'connected' : 'not connected'}`}
    onPress={onPress} style={({ pressed }) => [s.row, { opacity: pressed ? 0.55 : 1 }]}>
    <Mark brand={integrationBrand(integration.id)} size={46} />
    <View style={s.text}>
      <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{integration.name}</Text>
      <View style={s.detail}>
        {integration.installed && <Icon name="checkmark-circle" size={14} color={colors.success} />}
        {/* Two lines is what a 320pt phone needs to finish a tagline; a status line
            is short enough that it never reaches the second. */}
        <Text numberOfLines={2} style={[s.detailText, { color: integration.installed ? colors.success : colors.muted }]}>{detail}</Text>
      </View>
    </View>
    <Icon name="chevron-forward" size={16} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, minHeight: 72 },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
