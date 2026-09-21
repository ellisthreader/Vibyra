import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** `count` evenly staggered 0 → 1 loops on one period. They run on the JS
 *  thread because they drive SVG geometry (a radius, a stroke) that the native
 *  driver cannot reach. Sharing one period is what keeps the rings evenly
 *  spaced over a long search instead of bunching up. Stopping lands every ring
 *  back at its birth, where it is invisible. */
export function useRipples(active: boolean, count: number, period: number) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    values.forEach(value => value.setValue(0));
    if (!active) return;
    const loops = values.map((value, index) => {
      const animation = Animated.loop(Animated.timing(value, { toValue: 1, duration: period,
        easing: Easing.linear, useNativeDriver: false, isInteraction: false }));
      const timer = setTimeout(() => animation.start(), (period / count) * index);
      return { animation, timer };
    });
    return () => {
      loops.forEach(({ animation, timer }) => { clearTimeout(timer); animation.stop(); });
      values.forEach(value => value.setValue(0));
    };
  }, [active, count, period, values]);
  return values;
}

/** One 0 → 1 run, JS-driven for SVG. `instant` keeps it at 0 for Reduce Motion,
 *  which for a reply ring means it is never drawn. */
export function useOneShot(instant: boolean, duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (instant) return;
    const animation = Animated.timing(value, { toValue: 1, duration, delay,
      easing: Easing.linear, useNativeDriver: false, isInteraction: false });
    animation.start();
    return () => { animation.stop(); };
  }, [delay, duration, instant, value]);
  return value;
}

/** The top-left corner of a `box`-sized square centred on a point of the ring.
 *  Angles are stable per computer so a device keeps its spot between updates;
 *  they are decorative, never a real bearing. */
export function ringPoint(size: number, angle: number, radius: number, box: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    left: size / 2 + Math.sin(radians) * radius - box / 2,
    top: size / 2 - Math.cos(radians) * radius - box / 2,
  };
}
