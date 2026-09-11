import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { brandFor, vendorOf, type Brand } from './brands';
import { modelArtwork } from './modelArtwork';

/**
 * A company's own mark, in its own colour. Multicolour brands keep every colour;
 * a single-colour brand gets it; a mark that is monochrome by design — OpenAI and
 * xAI are black on white and white on black — follows the theme instead, which is
 * the colour its owner actually uses rather than one invented for it.
 */
export function BrandLogo({ vendor, size = 38 }: { vendor: string; size?: number }) {
  return <Mark brand={brandFor(vendor)} size={size} />;
}

/**
 * The same tile for a mark that is already resolved. Integrations carry their own
 * brand table rather than OpenRouter's vendor slugs, so they need the drawing
 * without the lookup; the rules above are the same for both.
 */
export function Mark({ brand, size = 38 }: { brand: Brand; size?: number }) {
  const { colors } = useTheme();
  // A brand that ships its own tile is an app icon, and an app icon's glyph sits
  // larger in its square than a bare mark does on our neutral one. The hairline
  // is what keeps a white tile from dissolving into a light-mode card.
  const mark = size * (brand.tile ? 0.62 : 0.52);
  return <View style={[s.tile, { width: size, height: size, borderRadius: size / 3,
    backgroundColor: brand.tile ?? colors.elevated },
    brand.tile ? { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.09)' } : null]}>
    {brand.paths ? <Svg width={mark} height={mark} viewBox="0 0 24 24">
      {brand.paths.map(part => <Path key={part.fill} d={part.d} fill={part.fill} />)}
    </Svg> : brand.path ? <Svg width={mark} height={mark} viewBox="0 0 24 24">
      <Path d={brand.path} fill={brand.color ?? colors.text} />
    </Svg> : <Text style={[s.initial, { fontSize: size * 0.44, color: brand.color ?? colors.text }]}>{brand.name.charAt(0)}</Text>}
  </View>;
}

/**
 * A model's own generated artwork where one exists, and its company's mark where
 * none does. The artwork set is shared with Vibyra Desktop and lags new releases,
 * so the fallback is the normal case rather than an error.
 */
export function ModelLogo({ id, size = 38 }: { id: string; size?: number }) {
  const art = modelArtwork(id);
  if (!art) return <BrandLogo vendor={id.includes('/') ? id.slice(0, id.indexOf('/')) : id} size={size} />;
  return <Image source={art} accessibilityIgnoresInvertColors resizeMode="cover"
    style={[s.tile, { width: size, height: size, borderRadius: size / 3 }]} />;
}
const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '600' },
});
