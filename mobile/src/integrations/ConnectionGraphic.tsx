import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import type { Brand } from '../ui/brands';
import { BrandMark, Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * Vibyra's mark, a line, and the service's mark: what is being joined to what,
 * before a word is read. The line draws across once as the sheet opens and a lock
 * settles on it, because the link is a private one; once connected it draws again
 * in the success colour and the lock becomes a tick, which is the one moment of
 * motion that confirms something happened. Reduce Motion lands it at rest.
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
    <View style={[s.tile, { backgroundColor: colors.elevated }]}><BrandMark size={32} /></View>
    <View style={s.link}>
      <View style={[s.track, { backgroundColor: colors.border }]} />
      <Animated.View style={[s.track, s.drawn, { backgroundColor: tint,
        width: draw.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      <Animated.View style={[s.knot, { backgroundColor: colors.surface, borderColor: tint,
        opacity: knot, transform: [{ scale: knot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
        <Icon name={connected ? 'checkmark' : 'lock-closed'} size={connected ? 13 : 11} color={tint} />
      </Animated.View>
    </View>
    <Mark brand={brand} size={56} />
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 4 },
  tile: { width: 56, height: 56, borderRadius: 56 / 3, alignItems: 'center', justifyContent: 'center' },
  link: { width: 84, height: 28, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },
  drawn: { right: undefined },
  knot: { alignSelf: 'center', width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center' },
});
