import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { KIND_COLORS } from './kindPalette';
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
 * A stack's own mark at the head of its row. A framework is recognised by its
 * mark long before its name is read, which is what makes the list worth
 * looking at rather than scanning.
 *
 * The mark sits on a wash of its own colour, so this step matches the grid of
 * coloured kinds before it — but only where that colour can actually be seen.
 * Eight of these brands are near-black by design (Angular, Express, Expo,
 * Django, Bevy, Anthropic), and a wash of near-black on the dark theme is an
 * empty square with an invisible glyph in it. Those fall back to the neutral
 * tile and the theme's own ink, which is how their owners draw them on a dark
 * ground anyway. The same rule catches JavaScript's yellow on the light theme.
 *
 * A stack with no mark falls back to its kind's glyph in that kind's colour, so
 * every row leads with something and the list keeps one rhythm.
 */
export function StackMark({ templateId, kind, size = 36 }: { templateId: string; kind: ProjectKind; size?: number }) {
  const { colors } = useTheme();
  const brand = STACK_BRANDS[templateId];
  const glyph = size * 0.55;
  const tile = (background: string, child: React.ReactNode, border?: string) =>
    <View style={[s.tile, { width: size, height: size, borderRadius: size / 3, backgroundColor: background },
      border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: border } : null]}>{child}</View>;

  if (!brand) {
    const tint = KIND_COLORS[kind] ?? colors.muted;
    return tile(`${tint}1F`, <ProjectKindIcon kind={kind} size={glyph} color={tint} />);
  }
  const draw = (fill: string) => <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
    {brand.paths
      ? brand.paths.map(part => <Path key={part.fill} d={part.d} fill={part.fill} />)
      : <Path d={brand.path!} fill={fill} />}
  </Svg>;
  // A brand that ships its own background is drawn on it, as its owner does.
  if (brand.tile) return tile(brand.tile, draw(brand.color ?? colors.text), 'rgba(0,0,0,0.09)');
  if (!brand.path) return tile(colors.elevated,
    <Text style={[s.initial, { fontSize: size * 0.44, color: colors.text }]}>{brand.name.charAt(0)}</Text>);
  const own = brand.color && contrast(brand.color, colors.elevated) >= 2;
  return tile(own ? `${brand.color}1F` : colors.elevated, draw(own ? brand.color! : colors.text));
}
const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
