import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import type { Brand } from '../ui/brands';
import { BrandMark, Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * Vibyra's mark, a line, and the service's mark: what is being joined to what,
 * before a word is read. Flat by request - the marks sit on the card itself, with
 * no tile behind them, and the lock sits in a gap in the line rather than in a
 * ring. The line draws across once as the card opens and the lock settles into
 * it; once connected it draws again in the success colour with a tick, which is
 * the one moment of motion that confirms something happened. Reduce Motion lands
 * it at rest.
 *
 * The drawing is JS-driven: it animates a width, which the native driver cannot.
 */
export function ConnectionGraphic({ brand, connected }: { brand: Brand; connected: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  // The hook starts as "reduced" and settles a moment later, so the decision is
  // read when the drawing starts rather than on the first render.
  const reducedNow = useRef(reduced); reducedNow.current = reduced;
  const draw = useRef(new Animated.Value(0)).current;
  const knot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    draw.setValue(0); knot.setValue(0);
    let motion: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      if (reducedNow.current) { draw.setValue(1); knot.setValue(1); return; }
      motion = Animated.sequence([
        Animated.timing(draw, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.spring(knot, { toValue: 1, damping: 11, stiffness: 240, mass: 0.7, useNativeDriver: false }),
      ]);
      motion.start();
    }, 170);
    return () => { clearTimeout(timer); motion?.stop(); };
  }, [connected, draw, knot]);
  const tint = connected ? colors.success : colors.accent;
  return <View style={s.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
    <View style={s.mark}><BrandMark size={46} /></View>
    <View style={s.link}>
      <View style={[s.track, { backgroundColor: colors.border }]} />
      <Animated.View style={[s.track, s.drawn, { backgroundColor: tint,
        width: draw.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      {/* The card's own colour behind the icon is what opens the gap in the line. */}
      <Animated.View style={[s.knot, { backgroundColor: colors.surface, opacity: knot,
        transform: [{ scale: knot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
        <Icon name={connected ? 'checkmark-circle' : 'lock-closed'} size={connected ? 20 : 16} color={tint} />
      </Animated.View>
    </View>
    <View style={s.mark}><Glyph brand={brand} size={40} /></View>
  </View>;
}

/**
 * A service's mark with no tile. A mark that ships on its own coloured square -
 * Stripe's white S on blurple - takes the square's colour instead, so it still
 * reads as that company; a white-tiled mark keeps its own colour; a monochrome
 * mark follows the theme.
 */
function Glyph({ brand, size }: { brand: Brand; size: number }) {
  const { colors } = useTheme();
  const tile = brand.tile && brand.tile.toUpperCase() !== '#FFFFFF' ? brand.tile : undefined;
  if (brand.paths) return <Svg width={size} height={size} viewBox="0 0 24 24">
    {brand.paths.map(part => <Path key={part.fill + part.d.length} d={part.d} fill={part.fill} />)}
  </Svg>;
  if (brand.path) return <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={brand.path} fill={tile ?? brand.color ?? colors.text} />
  </Svg>;
  return <Text style={[s.initial, { fontSize: size * 0.8, color: colors.text }]}>{brand.name.charAt(0)}</Text>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 6 },
  mark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  link: { width: 96, height: 28, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },
  drawn: { right: undefined },
  knot: { alignSelf: 'center', paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
