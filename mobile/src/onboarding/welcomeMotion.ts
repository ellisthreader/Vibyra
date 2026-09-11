import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { useReducedMotion } from '../ui/useReducedMotion';

// Staggered fade-up for `count` groups. Reduced-motion users get the finished state at once.
export function useEntrance(count: number) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    let active = true;
    const finish = () => values.forEach(value => value.setValue(1));
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      if (reduced) { finish(); return; }
      Animated.stagger(90, values.map(value => Animated.timing(value, {
        toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }))).start();
    }).catch(finish);
    return () => { active = false; };
  }, [values]);
  return values.map(value => ({
    opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  }));
}
// One endless drift: a glow eases out along (dx, dy) while growing and brightening, then eases back.
// Different periods keep several glows out of phase so the background feels alive, never busy.
export function useDrift({ period, dx, dy, grow = 1.08, opacity = 1 }: {
  period: number; dx: number; dy: number; grow?: number; opacity?: number;
}) {
  const value = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    value.setValue(0);
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: period / 2, easing: ease, useNativeDriver: true, isInteraction: false }),
      Animated.timing(value, { toValue: 0, duration: period / 2, easing: ease, useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [value, period, reduced]);
  const range = (to: number, from = 0) => value.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return { opacity: range(opacity, opacity * 0.72), transform: [{ translateX: range(dx) }, { translateY: range(dy) }, { scale: range(grow, 1) }] };
}
