import { Animated, Easing } from 'react-native';

/** The walkthrough's one curve: a quick start and a long, soft landing, the way iOS settles a sheet. */
export const settle = Easing.bezier(0.22, 1, 0.36, 1);
/** How long the spotlight and card take to travel between two stops. */
export const GLIDE = 520;

/**
 * Sends `value` to `to`. Everything the tour animates runs on the native driver, so
 * it stays smooth while the phone is busy mounting the next screen. `instant` is for
 * Reduce Motion and for the first stop, which simply appears where it is.
 */
export function move(value: Animated.Value, to: number, instant: boolean, duration = GLIDE, delay = 0) {
  value.stopAnimation();
  if (instant) {
    value.setValue(to);
    return;
  }
  Animated.timing(value, { toValue: to, duration, delay, easing: settle, useNativeDriver: true }).start();
}
