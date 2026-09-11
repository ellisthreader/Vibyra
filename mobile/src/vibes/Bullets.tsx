import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useAppear } from '../ui/motion';

/**
 * A plain list. The heading names what the list is; the rows say one thing each.
 *
 * The rows arrive in order, so a list that has just been replaced — switching
 * usage swaps every line — reads as this plan's answer rather than as text
 * quietly mutating. `key` the block on the plan to make a switch animate.
 *
 * `still` is a prop, not a hook call here: Reduce Motion resolves asynchronously
 * and reads as "reduce" until it does, so a component that remounts on every
 * switch would start each row at rest and never animate at all.
 */
export function Bullets({ title, lines, still }: { title: string; lines: string[]; still: boolean }) {
  const { colors } = useTheme();
  return <View style={s.block}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
    {lines.map((line, index) => <Line key={line} line={line} still={still} index={index} />)}
  </View>;
}

function Line({ line, still, index }: { line: string; still: boolean; index: number }) {
  const { colors } = useTheme();
  const appear = useAppear(still, index * 45);
  return <Animated.View testID="bullet" style={[s.row, { opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
    <Text style={[s.dot, { color: colors.accent }]}>•</Text>
    <Text style={[s.line, { color: colors.muted }]}>{line}</Text>
  </Animated.View>;
}
const s = StyleSheet.create({
  block: { gap: 9 },
  title: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginBottom: 1 },
  row: { flexDirection: 'row', gap: 10 },
  dot: { fontSize: 15, lineHeight: 22 },
  line: { flex: 1, fontSize: 14, lineHeight: 22 },
});
