import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { Icon } from '../ui/primitives';
import { CoachProgress } from './CoachProgress';
import { settle } from './tourMotion';

const POINTER = 14;

/**
 * The card beside the lit control: where you are, the stop's title and one sentence,
 * Skip, a round Back and a full-width Next. `content` fades the words between stops
 * while the card itself glides, so nothing cuts. A pointer on its edge aims at the
 * control it is about.
 */
export function CoachCard({ copy, index, count, content, pointer, instant, onLayout, onBack, onNext, onSkip }: {
  copy: { title: string; body: string }; index: number; count: number; content: Animated.Value;
  pointer: { side: 'top' | 'bottom'; x: number } | null; instant: boolean;
  onLayout(event: LayoutChangeEvent): void; onBack(): void; onNext(): void; onSkip(): void;
}) {
  const { colors } = useTheme();
  const last = index === count - 1;
  const label = last ? 'Get started' : 'Next';
  return <View onLayout={onLayout} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    {pointer && <Pointer key={`${pointer.side}${index}`} side={pointer.side} x={pointer.x} instant={instant} />}
    <View style={s.top}>
      <CoachProgress index={index} count={count} instant={instant} />
      <Pressable accessibilityRole="button" accessibilityLabel="Skip walkthrough" onPress={onSkip} hitSlop={12}
        style={({ pressed }) => [s.skip, pressed && { opacity: 0.5 }]}>
        <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
      </Pressable>
    </View>
    <Animated.View accessible accessibilityLabel={`${copy.title}. ${copy.body}`} style={[s.copy, { opacity: content,
      transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
      <Text style={[s.title, { color: colors.text }]}>{copy.title}</Text>
      <Text style={[s.body, { color: colors.muted }]}>{copy.body}</Text>
    </Animated.View>
    <View style={s.actions}>
      {index > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}
        style={({ pressed }) => [s.back, { backgroundColor: colors.elevated }, pressed && { opacity: 0.6 }]}>
        <Icon name="chevron-back" size={20} color={colors.text} />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onNext}
        style={({ pressed }) => [s.next, { backgroundColor: colors.action }, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}>
        <Text style={[s.nextText, { color: colors.onAction }]}>{label}</Text>
        {!last && <Icon name="arrow-forward" size={17} color={colors.onAction} />}
      </Pressable>
    </View>
  </View>;
}

/** A small notch on the card's edge, fading in as the card lands beside its control. */
function Pointer({ side, x, instant }: { side: 'top' | 'bottom'; x: number; instant: boolean }) {
  const { colors } = useTheme();
  const shown = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    if (instant) shown.setValue(1);
    else Animated.timing(shown, { toValue: 1, duration: 260, delay: 240, easing: settle, useNativeDriver: true }).start();
  }, [shown, instant]);
  const edge = { borderColor: colors.border, backgroundColor: colors.surface };
  return <Animated.View pointerEvents="none" style={[s.pointer, edge, { opacity: shown, left: x - POINTER / 2 },
    side === 'top' ? s.pointerTop : s.pointerBottom]} />;
}

const s = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { minHeight: 28, justifyContent: 'center' },
  skipText: { ...font.row, fontWeight: '600' },
  copy: { gap: 4, minHeight: 68 },
  title: { ...font.title2, fontSize: 20, lineHeight: 25 },
  body: { ...font.row, fontWeight: '400', lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  back: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  next: { flex: 1, height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextText: { ...font.headline },
  pointer: { position: 'absolute', width: POINTER, height: POINTER, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  pointerTop: { top: -POINTER / 2 - 0.5, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  pointerBottom: { bottom: -POINTER / 2 - 0.5, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
});
