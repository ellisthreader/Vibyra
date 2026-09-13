import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * The page's only decoration: one cobalt light in the top corner, faded out well
 * before its own box ends — a second blob near the bottom edge could not fade in
 * time and drew a hard line across the page.
 *
 * It is one source with two falloffs, not two lights: a tight core that gives the
 * corner somewhere to come from, and a wide field that carries it down behind the
 * balance. Concentric is what keeps that safe — the earlier hard line came from a
 * second origin, not from a second stop.
 *
 * Graphite and Cobalt does not allow a glow-heavy interface, so the pair together
 * stay under the opacity the single field used, and nothing below the figure is
 * tinted. It is hidden from assistive technology.
 */
export function Wash({ id, height, corner = 'right' }: { id: string; height: number; corner?: 'right' | 'left' }) {
  const { colors, dark } = useTheme();
  const cx = corner === 'right' ? '84%' : '16%';
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[s.wash, { height }]}>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${id}-field`} cx={cx} cy="-6%" r="82%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={dark ? 0.22 : 0.12} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-core`} cx={cx} cy="-4%" r="38%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={dark ? 0.20 : 0.10} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}-field)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}-core)`} />
    </Svg>
  </View>;
}
const s = StyleSheet.create({ wash: { position: 'absolute', top: 0, left: 0, right: 0 } });
