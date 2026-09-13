import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Enter and exit for something that has to stay mounted until it has finished
 * leaving, such as a bottom sheet. `value` runs 0 → 1 on the way in and back to 0
 * on the way out; `mounted` only drops once that exit has landed, so the sheet is
 * seen to go rather than vanishing. `instant` lands both at rest for Reduce Motion.
 *
 * Native-driven like the helpers in `motion.ts`, and kept beside them.
 */
export function usePresence(visible: boolean, instant: boolean) {
  const [mounted, setMounted] = useState(visible);
  const value = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(value, {
      toValue: visible ? 1 : 0,
      duration: instant ? 0 : visible ? 300 : 210,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => { animation.stop(); };
  }, [instant, value, visible]);
  return { mounted: mounted || visible, value };
}
