import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { settle } from './tourMotion';

const DOT = 6;
const STEP = DOT + 10;
const PILL = 16;

/** Where you are in the walkthrough: one dot a stop, and a lit pill that slides to the current one. */
export function CoachProgress({ index, count, instant }: { index: number; count: number; instant: boolean }) {
  const { colors } = useTheme();
  const at = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (instant) at.setValue(index);
    else Animated.timing(at, { toValue: index, duration: 380, easing: settle, useNativeDriver: true }).start();
  }, [at, index, instant]);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${count}`} style={s.row}>
    {Array.from({ length: count }, (_, dot) => <View key={dot} style={[s.dot, { backgroundColor: colors.muted, opacity: 0.32 }]} />)}
    <Animated.View style={[s.pill, { backgroundColor: colors.accent,
      transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, STEP] }) }] }]} />
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: STEP - DOT, paddingHorizontal: (PILL - DOT) / 2, height: 20 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  pill: { position: 'absolute', left: 0, top: 7, width: PILL, height: DOT, borderRadius: DOT / 2 },
});
