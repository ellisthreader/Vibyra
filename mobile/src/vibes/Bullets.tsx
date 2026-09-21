import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useAppear } from '../ui/motion';
import { RollingAmount } from './RollingAmount';

/** One row. `amount` and `unit` split a figure of Vibes from its words so the
 *  figure can roll; `text` is the whole line, as it is read aloud. */
export interface BulletItem { key: string; text: string; amount?: number; unit?: string }

const LINE = 24;

/**
 * A plain list. The heading names what the list is; the rows say one thing each.
 *
 * The rows arrive in order when the list first appears. After that a row keeps its
 * place by `key`: switching the size of Pro changes only the figures of Vibes, so
 * those roll to their new value and every other row stays exactly where it was. A
 * row whose words change is keyed by them instead, so it arrives again rather than
 * quietly mutating.
 *
 * `still` is a prop, not a hook call here: Reduce Motion resolves asynchronously
 * and reads as "reduce" until it does, so a row mounted in that window would never
 * animate at all.
 */
export function Bullets({ title, items, still, dense }: {
  title: string; items: BulletItem[]; still: boolean; dense?: boolean;
}) {
  const { colors } = useTheme();
  return <View testID="bullets" style={[s.block, dense && s.dense]}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
    {items.map((item, index) => <Line key={item.key} item={item} still={still} index={index} />)}
  </View>;
}

function Line({ item, still, index }: { item: BulletItem; still: boolean; index: number }) {
  const { colors } = useTheme();
  const appear = useAppear(still, index * 45);
  return <Animated.View testID="bullet" style={[s.row, { opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
    <Text style={[s.dot, { color: colors.accent }]}>•</Text>
    {item.amount === undefined
      ? <Text style={[s.text, s.line, { color: colors.muted }]}>{item.text}</Text>
      // Drawn exactly like the words around it — a bold, brighter figure was asked
      // to go — so the roll is the only thing that marks it as what changed.
      : <View accessible accessibilityLabel={item.text} style={s.figureLine}>
        <RollingAmount value={item.amount} still={still} height={LINE}
          style={[s.text, { color: colors.muted }]} />
        <Text style={[s.text, s.line, { color: colors.muted }]}>{item.unit}</Text>
      </View>}
  </Animated.View>;
}
// Sized to be read at a glance on the paywall, the one page that lists them: the
// lines were 14pt and asked to be clearer.
const s = StyleSheet.create({
  block: { gap: 11 }, dense: { gap: 8 },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, marginBottom: 1 },
  row: { flexDirection: 'row', gap: 11 },
  dot: { fontSize: 18, lineHeight: LINE },
  text: { fontSize: 16, lineHeight: LINE },
  line: { flex: 1 },
  figureLine: { flex: 1, flexDirection: 'row' },
});
