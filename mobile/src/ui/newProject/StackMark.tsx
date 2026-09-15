import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { ProjectKindIcon } from './ProjectKindIcon';
import { STACK_BRANDS } from './stackBrands';
import type { ProjectKind } from '../../scaffold/types';

/** WCAG relative luminance of a `#rrggbb`, for deciding whether a mark can be
 *  seen at all on the tile it is about to be drawn on. */
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
 * One neutral tile under every mark. Tinting each tile with its own brand
 * colour put twenty-nine different washes down one list and made a catalogue
 * look like a sticker sheet; the logos are already the colour on this screen,
 * and they read as a set once the ground under them stops competing.
 *
 * A mark keeps its own colour only where that colour can be seen against the
 * tile. Express, Django, Expo, Angular, Bevy and Anthropic are near-black by
 * design, and on the dark theme that is an invisible glyph on a dark square, so
 * those follow the theme's ink instead — which is how their owners draw them on
 * a dark ground anyway. The same rule catches JavaScript's yellow on the light
 * theme.
 *
 * A stack with no mark falls back to its kind's glyph, so every row leads with
 * something and the list keeps one rhythm.
 */
export function StackMark({ templateId, kind, size = 36 }: { templateId: string; kind: ProjectKind; size?: number }) {
  const { colors } = useTheme();
  const brand = STACK_BRANDS[templateId];
  const glyph = size * 0.55;
  const tile = (background: string, child: React.ReactNode, border?: string) =>
    <View style={[s.tile, { width: size, height: size, borderRadius: size / 3, backgroundColor: background },
      border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: border } : null]}>{child}</View>;

  if (!brand) return tile(colors.elevated, <ProjectKindIcon kind={kind} size={glyph} color={colors.muted} />);
  if (!brand.path && !brand.paths) return tile(colors.elevated,
    <Text style={[s.initial, { fontSize: size * 0.44, color: colors.text }]}>{brand.name.charAt(0)}</Text>);
  const own = brand.color && contrast(brand.color, colors.elevated) >= 2 ? brand.color : colors.text;
  const draw = <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
    {brand.paths
      ? brand.paths.map(part => <Path key={part.fill} d={part.d} fill={part.fill} />)
      : <Path d={brand.path!} fill={own} />}
  </Svg>;
  // A brand that ships its own background keeps it: that tile is the mark.
  return brand.tile ? tile(brand.tile, <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
    {brand.paths
      ? brand.paths.map(part => <Path key={part.fill} d={part.d} fill={part.fill} />)
      : <Path d={brand.path!} fill={brand.color ?? colors.text} />}
  </Svg>, 'rgba(0,0,0,0.09)') : tile(colors.elevated, draw);
}
const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
