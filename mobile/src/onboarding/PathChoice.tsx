import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { OnboardingMode } from '../ui/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { PathDevice } from './PathDevice';

/** What each way of coding is called on this page. Short names sit under the
 *  art; the full names are what a screen reader and the verify scripts hear. */
export const paths: Record<OnboardingMode, { label: string; title: string; detail: string }> = {
  computer: { label: 'Connect your computer', title: 'Your computer', detail: 'Your projects and terminals, on your phone.' },
  phone: { label: 'Code on this phone', title: 'This phone', detail: 'Start with an idea. No computer needed.' },
};

/** One of the two ways to code, standing on the page with no box around it,
 *  like a picker in iOS Settings. Choosing wakes the device and fills its
 *  radio; nothing else changes, so the choice is read at a glance. One spring
 *  drives the whole change, so the lift, the screen and the radio dot all
 *  move as one thing. Reduce Motion lands it at once. */
export function PathChoice({ mode, selected, onPress }: { mode: OnboardingMode; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { label, title, detail } = paths[mode];
  const still = useReducedMotion();
  const lit = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (still) { lit.setValue(selected ? 1 : 0); return; }
    const spring = Animated.spring(lit, { toValue: selected ? 1 : 0, damping: 15, stiffness: 150, mass: 0.9,
      useNativeDriver: true, isInteraction: false });
    spring.start();
    return () => spring.stop();
  }, [lit, selected, still]);
  const clamp = (outputRange: number[]) => lit.interpolate({ inputRange: [0, 1], outputRange, extrapolate: 'clamp' });
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={detail}
    aria-checked={selected} accessibilityState={{ checked: selected }} onPress={onPress}
    style={({ pressed }) => [s.choice, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
    <PathDevice phone={mode === 'phone'} lit={lit} />
    <Text style={[s.title, { color: colors.text }]}>{title}</Text>
    <View style={[s.radio, { borderColor: selected ? colors.action : colors.border }]}>
      <Animated.View style={[StyleSheet.absoluteFill, s.fill, { backgroundColor: colors.action, opacity: clamp([0, 1]) }]} />
      <Animated.View style={[s.dot, { backgroundColor: colors.onAction, opacity: clamp([0, 1]),
        transform: [{ scale: clamp([0.2, 1]) }] }]} />
    </View>
  </Pressable>;
}
const s = StyleSheet.create({
  choice: { flex: 1, maxWidth: 200, alignItems: 'center', paddingVertical: 8 },
  title: { marginTop: 22, fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.4 },
  radio: { marginTop: 16, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden' },
  fill: { borderRadius: 13 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
