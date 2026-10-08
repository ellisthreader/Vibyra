import { Fragment } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NearbyComputer } from './discoveryTypes';
import { FoundDevice } from './FoundDevice';
import { readiness, ringAngles } from './nearbyPairing';
import { useRipples } from './signalMotion';

export type SignalMode = 'searching' | 'found' | 'quiet' | 'blocked';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RINGS = 4;
const PERIOD = 3200;
// A ring is a wave, not a circle: thick and bright as it leaves the phone, thin and faint by the edge.
const LINE = { inputRange: [0, 1], outputRange: [2.6, 0.8] };
const WAKE = { inputRange: [0, 1], outputRange: [12, 4] };

/** The live face of the search, drawn as what is actually happening: this
 *  phone, at the centre, sending a signal out across the room. While iOS is
 *  browsing, rings leave from behind the phone and travel to the edge, and the
 *  phone's screen flashes as each one is born. A computer that answers lands
 *  on the ring as a small laptop, and sends one green ring back once it can
 *  be connected. The rings keep going until one can. At rest the
 *  phone waits with a faint ring around it; blocked, it shows the lock. With
 *  Reduce Motion the same picture is drawn still. No crosshair, no sweep: the
 *  signal is the whole design. */
export function SearchSignal({ size = 224, mode, computers }: {
  size?: number; mode: SignalMode; computers: NearbyComputer[];
}) {
  const { colors, dark } = useTheme();
  const still = useReducedMotion();
  const searching = mode === 'searching';
  const found = mode === 'found';
  const ripples = useRipples(searching && !still, RINGS, PERIOD);
  const k = size / 224;
  const half = size / 2;
  const birth = 46 * k;
  const edge = half - 3;
  const angles = ringAngles(computers.map(computer => computer.id));
  // The beacon flashes at each ring's birth, so the phone is seen to be the one calling.
  const spikes = Array.from({ length: RINGS }, (_, index) => index / RINGS);
  const beacon = searching && !still ? ripples[0].interpolate({
    inputRange: spikes.flatMap(at => [at, at + 0.025, at + 0.12]),
    outputRange: spikes.flatMap(() => [0.3, 1, 0.3]),
  }) : found ? 1 : 0.5;
  const glow = searching || found;
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[s.stage, { width: size, height: size }]}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="signal-glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={found ? colors.success : colors.accent} stopOpacity={dark ? 0.3 : 0.16} />
          <Stop offset="0.45" stopColor={found ? colors.success : colors.accent} stopOpacity={dark ? 0.06 : 0.03} />
          <Stop offset="1" stopColor={found ? colors.success : colors.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {glow && <Circle cx={half} cy={half} r={half} fill="url(#signal-glow)" />}
      {/* Where found computers land; drawn only once the rings are not passing through it. */}
      {!searching && <Circle cx={half} cy={half} r={size * 0.36} fill="none" strokeWidth={1}
        stroke={found ? colors.success : colors.border} strokeOpacity={found ? 0.35 : 0.9} />}
      {searching && ripples.map((ripple, index) => {
        const r = still ? birth + ((edge - birth) * (index + 1)) / RINGS
          : ripple.interpolate({ inputRange: [0, 1], outputRange: [birth, edge], easing: Easing.out(Easing.quad) });
        const fade = (peak: number) => still ? peak * (1 - index * 0.22)
          : ripple.interpolate({ inputRange: [0, 0.06, 0.55, 1], outputRange: [0, peak, peak * 0.4, 0] });
        // The wake is a soft, wide band under the line, which is what makes it read as a wave in motion.
        return <Fragment key={index}>
          <AnimatedCircle cx={half} cy={half} r={r} fill="none" stroke={colors.accent}
            strokeWidth={still ? 4 : ripple.interpolate(WAKE)} strokeOpacity={fade(dark ? 0.16 : 0.1)} />
          <AnimatedCircle cx={half} cy={half} r={r} fill="none" stroke={colors.accent}
            strokeWidth={still ? 1.4 : ripple.interpolate(LINE)} strokeOpacity={fade(dark ? 0.85 : 0.7)} />
        </Fragment>;
      })}
    </Svg>
    {computers.map((computer, index) => <FoundDevice key={computer.id} size={size} still={still}
      angle={angles[index]} index={index} state={readiness(computer)} live={searching || found} />)}
    <Phone k={k} beacon={beacon} mode={mode} />
  </View>;
}

/** This phone, drawn like the one in the setup art so the two pages share one
 *  device. The screen carries one thing: the beacon, or the lock. */
function Phone({ k, beacon, mode }: { k: number; beacon: Animated.AnimatedInterpolation<number> | number; mode: SignalMode }) {
  const { colors, dark } = useTheme();
  const tint = mode === 'found' ? colors.success : mode === 'quiet' ? colors.muted : colors.accent;
  const lit = mode === 'searching' || mode === 'found';
  return <View style={[s.phone, { width: 48 * k, height: 84 * k, borderRadius: 14 * k, padding: 3.5 * k,
    backgroundColor: dark ? '#2A2E38' : colors.surface, borderColor: dark ? 'rgba(255,255,255,0.18)' : colors.border,
    shadowColor: '#080B12', shadowOpacity: dark ? 0.55 : 0.16, shadowRadius: 16 * k,
    shadowOffset: { width: 0, height: 9 * k } }]}>
    {dark && <View style={[s.gloss, { left: 11 * k, right: 11 * k }]} />}
    <View style={[s.screen, { borderRadius: 11 * k, backgroundColor: dark ? colors.background : colors.elevated }]}>
      {/* The screen is lit in the mode's colour, so the phone is seen to be awake, not a black slab. */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: 11 * k, backgroundColor: tint, opacity: lit ? 0.14 : 0.05 }]} />
      <View style={[s.slot, { top: 5 * k, width: 12 * k, height: 2.5 * k, backgroundColor: colors.border }]} />
      {mode === 'blocked' ? <Icon name="lock-closed" size={17 * k} color={colors.muted} />
        : <Animated.View style={{ width: 10 * k, height: 10 * k, borderRadius: 5 * k, backgroundColor: tint,
          opacity: beacon, shadowColor: tint, shadowOpacity: 0.9, shadowRadius: 7 * k,
          shadowOffset: { width: 0, height: 0 } }} />}
      <View style={[s.slot, { bottom: 5 * k, width: 14 * k, height: 2.5 * k, backgroundColor: colors.border }]} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  stage: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  phone: { borderWidth: 1 },
  gloss: { position: 'absolute', top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slot: { position: 'absolute', borderRadius: 2 },
});
