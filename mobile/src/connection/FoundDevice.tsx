import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { useAppear, useBreath } from '../ui/motion';
import type { Readiness } from './nearbyPairing';
import { ringPoint, useOneShot } from './signalMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** One computer answering the phone. A small laptop, drawn the way the setup
 *  art draws it, springs onto the ring in the colour of its row: blue and
 *  breathing quickly while the phone is still resolving it, amber when it
 *  needs a newer Vibyra, green once it can be connected. The moment it turns
 *  green it sends one ring back — the reply to the phone's blue signal — and
 *  keeps a soft light under it so the picture still reads as live once the
 *  search has stopped. Owns its own drivers so the number of computers can
 *  change freely. */
export function FoundDevice({
  size,
  angle,
  index,
  still,
  state,
  live,
}: {
  size: number;
  angle: number;
  index: number;
  still: boolean;
  state: Readiness;
  live: boolean;
}) {
  const { colors, dark } = useTheme();
  const ready = state === 'ready';
  const working = state === 'pending' && live;
  const tone = ready
    ? colors.success
    : state === 'older'
      ? colors.warning
      : working
        ? colors.accent
        : colors.muted;
  const beat = 90 + index * 130;
  const appear = useAppear(still, beat);
  const reply = useOneShot(still || !ready, 1500, beat + 160);
  const halo = useBreath(!still && (ready || working), ready ? 2800 : 1400);
  const k = size / 224;
  const reach = size * 0.5;
  const glowId = `device-glow-${index}`;
  const shell = {
    backgroundColor: dark ? '#2A2E38' : colors.surface,
    borderColor: dark ? 'rgba(255,255,255,0.18)' : colors.border,
    shadowColor: '#080B12',
    shadowOpacity: dark ? 0.5 : 0.14,
    shadowRadius: 9 * k,
    shadowOffset: { width: 0, height: 5 * k },
  };
  return (
    <View
      pointerEvents="none"
      style={[s.box, { width: reach, height: reach }, ringPoint(size, angle, size * 0.36, reach)]}
    >
      <Svg width={reach} height={reach} style={StyleSheet.absoluteFill}>
        {ready && (
          <AnimatedCircle
            cx={reach / 2}
            cy={reach / 2}
            fill="none"
            stroke={tone}
            strokeWidth={reply.interpolate({ inputRange: [0, 1], outputRange: [2.2, 0.8] })}
            r={reply.interpolate({
              inputRange: [0, 1],
              outputRange: [16 * k, reach / 2 - 2],
              easing: Easing.out(Easing.cubic),
            })}
            strokeOpacity={reply.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.8, 0] })}
          />
        )}
      </Svg>
      {/* A soft light rather than a flat disc: it falls off to nothing, so it never draws a hard edge. */}
      <Animated.View
        style={[
          s.glow,
          {
            width: 84 * k,
            height: 84 * k,
            opacity: halo.interpolate({
              inputRange: [0, 1],
              outputRange: ready || working ? [0.55, 1] : [0.4, 0.4],
            }),
            transform: [
              { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
            ],
          },
        ]}
      >
        <Svg width={84 * k} height={84 * k}>
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tone} stopOpacity={dark ? 0.42 : 0.3} />
              <Stop offset="0.55" stopColor={tone} stopOpacity={dark ? 0.1 : 0.07} />
              <Stop offset="1" stopColor={tone} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={42 * k} cy={42 * k} r={42 * k} fill={`url(#${glowId})`} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          s.laptop,
          {
            width: 52 * k,
            opacity: appear,
            transform: [
              { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
            ],
          },
        ]}
      >
        <View
          style={[
            s.lid,
            shell,
            {
              marginHorizontal: 4 * k,
              height: 30 * k,
              padding: 2.5 * k,
              borderTopLeftRadius: 5 * k,
              borderTopRightRadius: 5 * k,
            },
          ]}
        >
          {dark && <View style={[s.gloss, { left: 6 * k, right: 6 * k }]} />}
          <View
            style={[
              s.screen,
              {
                borderRadius: 2.5 * k,
                backgroundColor: dark ? colors.background : colors.elevated,
              },
            ]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: tone, opacity: ready || working ? 0.14 : 0.05 },
              ]}
            />
            <View
              style={{
                width: 7 * k,
                height: 7 * k,
                borderRadius: 3.5 * k,
                backgroundColor: tone,
                shadowColor: tone,
                shadowOpacity: 0.9,
                shadowRadius: 5 * k,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          </View>
        </View>
        <View
          style={[
            s.deck,
            shell,
            {
              height: 5 * k,
              borderBottomLeftRadius: 3.5 * k,
              borderBottomRightRadius: 3.5 * k,
              shadowOpacity: 0,
            },
          ]}
        >
          <View
            style={[s.lip, { width: 14 * k, height: 1.5 * k, backgroundColor: colors.border }]}
          />
        </View>
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  box: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  laptop: { alignItems: 'stretch' },
  gloss: { position: 'absolute', top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  lid: { borderWidth: 1, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  deck: { borderWidth: 1, borderTopWidth: 0, alignItems: 'center', justifyContent: 'center' },
  lip: { borderRadius: 1 },
});
