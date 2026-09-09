import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NearbyComputer } from './discoveryTypes';
import { radarAngles } from './nearbyPairing';
import { RadarBlip } from './RadarBlip';
import { useBreath, useLoop, radarPoint } from './radarMotion';

export type RadarMode = 'searching' | 'found' | 'quiet' | 'blocked';
const SWEEP = 3400;
const WAVE = 2900;
const BANDS: [number, number, number][] = [[0, 0.34, 0.16], [0.34, 0.64, 0.4], [0.64, 0.96, 0.75]];
const TRAIL: [number, number][] = [[9, 0.3], [19, 0.22], [31, 0.15], [45, 0.09], [61, 0.05]];

/** The live face of the search: three rings, an expanding wave for each ping,
 *  a rotating sweep while iOS is browsing, and one blip per computer found.
 *  With Reduce Motion the same picture is drawn at rest. */
export function RadarScan({ size = 236, mode, computers }: {
  size?: number; mode: RadarMode; computers: NearbyComputer[];
}) {
  const { colors } = useTheme();
  const still = useReducedMotion();
  const scanning = mode === 'searching' && !still;
  const sweep = useLoop(scanning, SWEEP);
  const waves = [useLoop(scanning, WAVE, 0, false), useLoop(scanning, WAVE, WAVE / 3, false),
    useLoop(scanning, WAVE, (WAVE * 2) / 3, false)];
  const breath = useBreath(mode === 'found' && !still);
  const tint = mode === 'found' ? colors.success : mode === 'blocked' ? colors.muted : colors.accent;
  const dim = mode === 'quiet' || mode === 'blocked';
  const rings = [1, 0.72, 0.44];
  const angles = radarAngles(computers.map(computer => computer.id));
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
    style={[s.face, { width: size, height: size }]}>
    <Animated.View style={[s.fill, { borderRadius: size / 2, backgroundColor: tint,
      opacity: mode === 'found' ? breath.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.12] }) : 0.045 }]} />
    {rings.map(scale => <View key={scale} style={[s.ring, { width: size * scale, height: size * scale,
      borderRadius: (size * scale) / 2, borderColor: tint, opacity: dim ? 0.16 : 0.28 }]} />)}
    <View style={[s.axis, { width: size * 0.98, backgroundColor: tint, opacity: dim ? 0.08 : 0.14 }]} />
    <View style={[s.vertical, { height: size * 0.98, backgroundColor: tint, opacity: dim ? 0.08 : 0.14 }]} />
    {waves.map((wave, index) => <Animated.View key={index} style={[s.wave, {
      width: size, height: size, borderRadius: size / 2, borderColor: colors.accent,
      opacity: wave.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.42, 0] }),
      transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.02] }) }],
    }]} />)}
    {mode === 'searching' && <Animated.View style={[s.sweep, { width: size, height: size,
      transform: [{ rotate: still ? '38deg' : sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      {/* Bands instead of a gradient: brightest at the tip, fading toward the centre. */}
      {BANDS.map(([from, to, opacity]) => <View key={to} style={[s.arm, {
        left: size / 2 - 1.25, top: (size / 2) * (1 - to), height: (size / 2) * (to - from),
        backgroundColor: colors.accent, opacity }]} />)}
      <View style={[s.head, { ...radarPoint(size, 0, size * 0.47, 10), backgroundColor: colors.accent,
        shadowColor: colors.accent }]} />
      {TRAIL.map(([angle, opacity]) => <View key={angle} style={[s.trail,
        { ...radarPoint(size, -angle, size * 0.46, 5), backgroundColor: colors.accent, opacity }]} />)}
    </Animated.View>}
    {computers.map((computer, index) => <RadarBlip key={computer.id} size={size} still={still}
      angle={angles[index]} index={index} />)}
    <View style={[s.core, { backgroundColor: colors.surface, borderColor: dim ? colors.border : tint }]}>
      <Icon name={mode === 'blocked' ? 'lock-closed' : mode === 'found' ? 'checkmark' : 'phone-portrait-outline'}
        size={mode === 'found' ? 28 : 24} color={dim && mode !== 'blocked' ? colors.muted : tint} />
    </View>
  </View>;
}
const s = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  ring: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth },
  wave: { position: 'absolute', borderWidth: 1.5 },
  axis: { position: 'absolute', height: StyleSheet.hairlineWidth },
  vertical: { position: 'absolute', width: StyleSheet.hairlineWidth },
  sweep: { position: 'absolute' },
  arm: { position: 'absolute', width: 2.5, borderRadius: 1.5 },
  head: { position: 'absolute', width: 10, height: 10, borderRadius: 5,
    shadowOpacity: 0.9, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  trail: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  core: { width: 54, height: 54, borderRadius: 19, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center' },
});
