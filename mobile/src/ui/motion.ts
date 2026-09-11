import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Shared interface motion, and the only place a driver belongs.
 * `connection/radarMotion.ts` held duplicate breath and entrance drivers for the
 * pairing radar; both went with the radar when the connect flow was stripped to
 * plain text.
 */

/** A looping 0 → 1 → 0 breath, for something that is idling rather than working. */
export function useBreath(active: boolean, duration = 2800) {
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
    const animation = Animated.spring(value, { toValue: 1, delay, damping: 15, stiffness: 180,
      mass: 0.9, useNativeDriver: true });
    animation.start();
    return () => { animation.stop(); };
  }, [delay, instant, value]);
  return value;
}

/**
 * Counts to a new number instead of replacing it, so Vibes arriving or being
 * spent is something you see happen. It animates on a change only: the first
 * value is simply shown, because Reduce Motion is unknown for the first frames
 * and a balance must never render as a placeholder.
 */
export function useCountUp(value: number, instant: boolean) {
  const [shown, setShown] = useState(value);
  const driver = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    if (instant) { driver.setValue(value); setShown(value); return; }
    const listener = driver.addListener(frame => setShown(Math.round(frame.value)));
    const animation = Animated.timing(driver, { toValue: value, duration: 750,
      easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(() => setShown(value));
    return () => { animation.stop(); driver.removeListener(listener); };
  }, [driver, instant, value]);
  return shown;
}
