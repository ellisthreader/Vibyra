import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { ProjectKindIcon } from './ProjectKindIcon';
import { STACK_BRANDS } from './stackBrands';
import type { ProjectKind } from '../../scaffold/types';

/** WCAG relative luminance of a `#rrggbb`, for deciding whether a mark can be
 *  seen at all on the ground it is about to be drawn on. */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/**
 * A stack's own mark at the head of its row, drawn straight onto the row. There
 * is no tile behind it: a rounded square under every logo added twenty-nine
 * small panels to a list that already has rows, and the marks are stronger
 * without one.
 *
 * A mark keeps its own colour only where that colour can be seen against the
 * card it now sits on. Express, Django, Expo, Angular, Bevy and Anthropic are
 * near-black by design, and with the tile gone there is nothing to lift them
 * off a dark ground, so those follow the theme's ink — which is how their
 * owners draw them on dark anyway. The same rule catches JavaScript's yellow on
 * the light theme.
 */
export function StackMark({
  templateId,
  kind,
  size = 26,
}: {
  templateId: string;
  kind: ProjectKind;
  size?: number;
}) {
  const { colors } = useTheme();
  const brand = STACK_BRANDS[templateId];
  if (!brand)
    return (
      <View style={[s.slot, { width: size, height: size }]}>
        <ProjectKindIcon kind={kind} size={size * 0.92} color={colors.muted} />
      </View>
    );
  if (!brand.path && !brand.paths)
    return (
      <View style={[s.slot, { width: size, height: size }]}>
        <Text style={[s.initial, { fontSize: size * 0.7, color: colors.text }]}>
          {brand.name.charAt(0)}
        </Text>
      </View>
    );
  const ink = brand.color && contrast(brand.color, colors.surface) >= 2 ? brand.color : colors.text;
  return (
    <View style={[s.slot, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {brand.paths ? (
          brand.paths.map((part) => <Path key={part.fill} d={part.d} fill={part.fill} />)
        ) : (
          <Path d={brand.path!} fill={ink} />
        )}
      </Svg>
    </View>
  );
}
const s = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
