import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useRef } from 'react';
import { useTheme } from '../../theme';
import { useReducedMotion } from '../useReducedMotion';

/**
 * The wizard's own action button. The app's general one is a full-width slab
 * with an 18pt corner, which is right in a settings page full of square cards
 * and wrong at the foot of a sheet: it reads as another panel rather than the
 * thing to press.
 *
 * So: a pill, a little taller, with the label tightened. The fill is still the
 * accent the person picked — `action` is a theme role, not a colour this screen
 * gets to decide — and the secondary is the same pill drawn as an outline, so
 * Cancel next to Open it in a terminal is quieter without being hard to find.
 *
 * Pressing dips it very slightly. A button that only changes opacity feels
 * painted on; a button that gives under the thumb feels like a button.
 */
export function WizardButton({ title, label, onPress, secondary, busy, disabled }: {
  title: string; label?: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const dip = useRef(new Animated.Value(0)).current;
  const off = disabled || busy;
  const press = (to: number) => {
    if (reduced) return;
    Animated.spring(dip, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const scale = dip.interpolate({ inputRange: [0, 1], outputRange: [1, 0.975] });
  const ink = secondary ? colors.text : colors.onAction;
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title}
      aria-disabled={off} aria-busy={busy} accessibilityState={{ disabled: off, busy }}
      disabled={off} onPress={onPress} onPressIn={() => press(1)} onPressOut={() => press(0)}
      style={({ pressed }) => [s.pill, {
        backgroundColor: secondary ? 'transparent' : colors.action,
        borderColor: secondary ? colors.border : 'transparent',
        opacity: disabled ? 0.35 : pressed ? 0.9 : 1 }]}>
      {busy ? <ActivityIndicator color={ink} />
        : <Text numberOfLines={1} style={[s.label, { color: ink }]}>{title}</Text>}
    </Pressable>
  </Animated.View>;
}
const s = StyleSheet.create({
  pill: { minHeight: 54, borderRadius: 27, paddingHorizontal: 22, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  label: { fontSize: 16.5, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center', flexShrink: 1 },
});
