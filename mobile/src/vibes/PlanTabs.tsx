import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { planNames, planSizes } from './plans';
import type { VibesProduct } from './types';

const PAD = 3;

/**
 * The size of Pro, as a small switch under the headline: "10×" or "20×". It is a
 * segmented control rather than cards because the page is still one plan — the
 * switch says how much of it, and the bullets and the button beneath follow.
 *
 * A graphite track and a lightly tinted selection make the current size clear.
 * The thumb slides without bouncing; the purchase remains the strongest accent.
 * The thumb is measured from the track, so the labels decide nothing about widths.
 */
export function PlanTabs({
  sizes,
  selected,
  still,
  disabled,
  onSelect,
}: {
  sizes: VibesProduct[];
  selected: string | null;
  still: boolean;
  disabled?: boolean;
  onSelect(plan: string | null): void;
}) {
  const { colors, dark } = useTheme();
  const index = Math.max(
    0,
    sizes.findIndex((p) => p.plan === selected),
  );
  const [inner, setInner] = useState(0);
  const slide = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (still) {
      slide.setValue(index);
      return;
    }
    const spring = Animated.spring(slide, {
      toValue: index,
      damping: 26,
      stiffness: 300,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: true,
      isInteraction: false,
    });
    spring.start();
    return () => spring.stop();
  }, [index, still, slide]);
  const segment = inner / sizes.length;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setInner(e.nativeEvent.layout.width - PAD * 2)}
      style={[
        s.track,
        { backgroundColor: dark ? colors.surface : colors.elevated, borderColor: colors.border },
      ]}
    >
      {inner > 0 && (
        <Animated.View
          testID="plan-selection"
          pointerEvents="none"
          style={[
            s.thumb,
            {
              width: segment,
              backgroundColor: colors.accentSoft,
              borderColor: colors.accent,
              transform: [
                {
                  translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }),
                },
              ],
            },
          ]}
        />
      )}
      {sizes.map((size) => {
        const active = size.plan === selected;
        return (
          <Pressable
            key={size.id}
            accessibilityRole="tab"
            aria-selected={active}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityLabel={`${planNames[size.plan ?? ''] ?? size.plan}, ${size.credits.toLocaleString()} Vibes a month`}
            onPress={() => {
              if (!active) onSelect(size.plan);
            }}
            style={s.segment}
          >
            <Text style={[s.label, { color: active ? colors.text : colors.muted }]}>
              Pro {planSizes[size.plan ?? '']}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: 208,
    maxWidth: '100%',
    padding: PAD,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
});
