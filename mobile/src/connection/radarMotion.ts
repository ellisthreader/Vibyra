import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** A looping 0 → 1 driver. Every loop shares one period so staggered copies keep
 *  their spacing instead of drifting apart over a long search. */
export function useLoop(active: boolean, duration: number, delay = 0, linear = true) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (!active) return;
    const animation = Animated.loop(Animated.timing(value, { toValue: 1, duration,
      easing: linear ? Easing.linear : Easing.out(Easing.quad), useNativeDriver: true }));
    const timer = setTimeout(() => animation.start(), delay);
    return () => { clearTimeout(timer); animation.stop(); value.setValue(0); };
  }, [active, delay, duration, linear, value]);
  return value;
}

/** A looping 0 → 1 → 0 breath for the settled state. */
export function useBreath(active: boolean, duration = 2200) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (!active) return;
    const half = { duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true };
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, ...half }),
      Animated.timing(value, { toValue: 0, ...half }),
    ]));
    animation.start();
    return () => { animation.stop(); value.setValue(0); };
  }, [active, duration, value]);
  return value;
}

/** A one-shot entrance. `instant` lands it at rest for Reduce Motion. */
export function useAppear(instant: boolean, delay = 0) {
  const value = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    if (instant) { value.setValue(1); return; }
    const animation = Animated.spring(value, { toValue: 1, delay, damping: 14, stiffness: 170,
      mass: 0.9, useNativeDriver: true });
    animation.start();
    return () => { animation.stop(); };
  }, [delay, instant, value]);
  return value;
}

/** Places a point on the radar face. Angles are stable per computer so a blip
 *  keeps its spot between updates; they are decorative, never a real bearing. */
export function radarPoint(size: number, angle: number, radius: number, dot: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    left: size / 2 + Math.sin(radians) * radius - dot / 2,
    top: size / 2 - Math.cos(radians) * radius - dot / 2,
  };
}
