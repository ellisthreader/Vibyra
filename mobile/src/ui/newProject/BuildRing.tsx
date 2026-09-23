import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';
import { useReducedMotion } from '../useReducedMotion';
import type { RunPhase } from '../../scaffold/wizard';

const SIZE = 168;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const ArcCircle = Animated.createAnimatedComponent(Circle);

/**
 * The build, as one thing to watch. A ring that fills step by step, a second
 * arc sweeping round it while the computer is actually working, and the count
 * in the middle.
 *
 * The sweep is the honest part. The computer reports which step it is on, not
 * how far through that step it is, so the ring holds at the step's share and
 * the sweep says work is still happening. A bar that crept forward on a timer
 * would be inventing progress it has not been told about.
 *
 * Reduce Motion gets the ring and the numbers and none of the movement.
 */
export function BuildRing({
  phase,
  index,
  total,
  label,
}: {
  phase: RunPhase;
  index: number;
  total: number;
  label: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const running = phase === 'running';
  const done = phase === 'done';
  const tone = done
    ? colors.success
    : phase === 'stalled'
      ? colors.warning
      : phase === 'failed'
        ? colors.error
        : colors.accent;
  const share = total > 0 ? Math.min(index / total, 1) : 0;
  const fraction = done ? 1 : share;

  const fill = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction,
      duration: reduced ? 0 : 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fraction, reduced, fill]);
  useEffect(() => {
    if (!running || reduced) {
      spin.setValue(0);
      breathe.setValue(0);
      return;
    }
    const turn = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    turn.start();
    pulse.start();
    return () => {
      turn.stop();
      pulse.stop();
    };
  }, [running, reduced, spin, breathe]);

  const offset = fill.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const shown = done ? total : Math.min(index + (running ? 1 : 0), total);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done ? total : index }}
      accessibilityLabel={label}
      style={s.wrap}
    >
      {running && !reduced && (
        <Animated.View style={[s.sweep, { opacity: glow, transform: [{ rotate }] }]}>
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={tone} stopOpacity="0" />
                <Stop offset="1" stopColor={tone} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke="url(#sweep)"
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * 0.24} ${CIRCUMFERENCE}`}
            />
          </Svg>
        </Animated.View>
      )}
      <Svg width={SIZE} height={SIZE} style={s.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <ArcCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={tone}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={s.middle} pointerEvents="none">
        {done ? (
          <Text style={[s.tick, { color: tone }]}>✓</Text>
        ) : (
          <>
            <Text style={[s.count, { color: colors.text }]}>{shown}</Text>
            <Text style={[s.of, { color: colors.muted }]}>{`of ${total || 1}`}</Text>
          </>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute' },
  sweep: { position: 'absolute' },
  middle: { alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 46, fontWeight: '700', letterSpacing: -1.5, lineHeight: 52 },
  of: { fontSize: 13.5, fontWeight: '600', letterSpacing: 0.2, marginTop: 2 },
  tick: { fontSize: 58, lineHeight: 64, fontWeight: '700' },
});
