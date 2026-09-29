import type { ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useAppear } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';

/** Fades and lifts its children in once when they mount, so a card or a new part of
 *  one arrives instead of blinking into place. Reduce Motion lands it at rest. */
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const appear = useAppear(reduced, delay);
  return <Animated.View style={[{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }, style]}>
    {children}
  </Animated.View>;
}
