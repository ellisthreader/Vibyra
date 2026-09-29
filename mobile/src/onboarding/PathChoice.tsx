import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { OnboardingMode } from '../ui/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { PathDevice } from './PathDevice';

/** What each way of coding is called on this page. Short names sit under the
 *  art; the full names are what a screen reader and the verify scripts hear. */
export const paths: Record<OnboardingMode, { label: string; title: string; detail: string }> = {
  computer: {
    label: 'Connect your computer',
    title: 'Your computer',
    detail: 'Your projects and terminals, on your phone.',
  },
  phone: {
    label: 'Code on this phone',
    title: 'This phone',
    detail: 'Start with an idea. No computer needed.',
  },
};

/** One of the two ways to code, as one of two cards side by side. Choosing wakes the
 *  device, tints the card and fills its radio in the corner; the other settles back.
 *  One spring drives the whole change, so the lift, the screen, the tint and the dot
 *  move as one thing. Reduce Motion lands it at once. */
export function PathChoice({
  mode,
  selected,
  onPress,
}: {
  mode: OnboardingMode;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { label, title, detail } = paths[mode];
  const still = useReducedMotion();
  const lit = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      lit.setValue(selected ? 1 : 0);
      return;
    }
    const spring = Animated.spring(lit, {
      toValue: selected ? 1 : 0,
      damping: 15,
      stiffness: 150,
      mass: 0.9,
      useNativeDriver: true,
      isInteraction: false,
    });
    spring.start();
    return () => spring.stop();
  }, [lit, selected, still]);
  const clamp = (outputRange: number[]) =>
    lit.interpolate({ inputRange: [0, 1], outputRange, extrapolate: 'clamp' });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={detail}
      aria-checked={selected}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          s.tint,
          { backgroundColor: colors.accentSoft, opacity: clamp([0, 1]) },
        ]}
      />
      <View style={[s.radio, { borderColor: selected ? colors.action : colors.border }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            s.fill,
            { backgroundColor: colors.action, opacity: clamp([0, 1]) },
          ]}
        />
        <Animated.View
          style={[
            s.dot,
            {
              backgroundColor: colors.onAction,
              opacity: clamp([0, 1]),
              transform: [{ scale: clamp([0.2, 1]) }],
            },
          ]}
        />
      </View>
      <PathDevice phone={mode === 'phone'} lit={lit} />
      <Text style={[s.title, { color: colors.text }]}>{title}</Text>
      <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  choice: {
    flex: 1,
    maxWidth: 220,
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tint: { borderRadius: 15 },
  title: {
    marginTop: 18,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  detail: { marginTop: 4, fontSize: 13, lineHeight: 18, letterSpacing: -0.05, textAlign: 'center' },
  radio: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { borderRadius: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
