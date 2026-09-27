import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { useReducedMotion } from './useReducedMotion';

const REVEAL = 88;
const FULL_SWIPE = 132;
const native = Platform.OS !== 'web';

/** Swipe a terminal left to reveal Delete, or continue swiping to delete it. */
export function SwipeToDeleteRow({ children, enabled, label, onDelete, testID }: {
  children: ReactNode; enabled: boolean; label: string; onDelete(): Promise<boolean>; testID?: string;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const position = useRef(new Animated.Value(0)).current;
  const width = useRef(320);
  const settled = useRef(0);
  const deleting = useRef(false);
  const mounted = useRef(true);
  const [hidden, setHidden] = useState(false);
  const live = useRef({ enabled, onDelete, reducedMotion });
  live.current = { enabled, onDelete, reducedMotion };
  useEffect(() => () => { mounted.current = false; }, []);

  const snap = (to: number) => {
    settled.current = to;
    if (live.current.reducedMotion) {
      position.setValue(to);
      return;
    }
    Animated.spring(position, { toValue: to, damping: 22, stiffness: 240,
      mass: 0.8, overshootClamping: true, useNativeDriver: native }).start();
  };
  const remove = () => {
    if (!live.current.enabled || deleting.current) return;
    deleting.current = true;
    const finish = async () => {
      const removed = await live.current.onDelete();
      if (!mounted.current) return;
      if (removed) setHidden(true);
      else { deleting.current = false; snap(0); }
    };
    if (live.current.reducedMotion) {
      void finish();
      return;
    }
    Animated.timing(position, { toValue: -width.current, duration: 230,
      easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(({ finished }) => {
      if (finished) void finish();
      else deleting.current = false;
    });
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => live.current.enabled && !deleting.current &&
      Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onMoveShouldSetPanResponder: (_, gesture) => live.current.enabled && !deleting.current &&
      Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => {
      position.setValue(Math.max(-FULL_SWIPE - 18, Math.min(0, settled.current + gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const end = settled.current + gesture.dx;
      if (end <= -FULL_SWIPE) remove();
      else snap(end <= -REVEAL / 2 ? -REVEAL : 0);
    },
    onPanResponderTerminate: () => snap(0),
  })).current;
  if (hidden) return null;
  const actionOpacity = position.interpolate({ inputRange: [-REVEAL, -12, 0],
    outputRange: [1, 0.2, 0], extrapolate: 'clamp' });
  const actionScale = position.interpolate({ inputRange: [-REVEAL, 0],
    outputRange: [1, 0.82], extrapolate: 'clamp' });
  return <View style={s.clipped} onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}>
    {enabled && <Animated.View style={[s.action, { backgroundColor: colors.error,
      opacity: actionOpacity, transform: [{ scale: actionScale }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={remove}
        style={s.actionPress}>
        <Icon name="trash-outline" size={18} color="#FFFFFF" />
        <Text style={s.actionText}>Delete</Text>
      </Pressable>
    </Animated.View>}
    <Animated.View {...pan.panHandlers} testID={testID} style={{ backgroundColor: colors.rail,
      transform: [{ translateX: position }] }}>{children}</Animated.View>
  </View>;
}

const s = StyleSheet.create({
  clipped: { overflow: 'hidden', borderRadius: 9 },
  action: { position: 'absolute', right: 2, top: 2, bottom: 2, width: REVEAL - 4,
    borderRadius: 8 },
  actionPress: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.15 },
});
