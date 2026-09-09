import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { useAppear, useBreath, radarPoint } from './radarMotion';

/** One computer landing on the radar face: it springs in where it will stay,
 *  then keeps a slow halo so the face still reads as live after the sweep
 *  stops. Owns its own drivers so the number of blips can change freely. */
export function RadarBlip({ size, angle, index, still }: {
  size: number; angle: number; index: number; still: boolean;
}) {
  const { colors } = useTheme();
  const appear = useAppear(still, 120 + index * 90);
  const halo = useBreath(!still, 2600);
  const radius = size * (index % 2 === 0 ? 0.3 : 0.38);
  return <Animated.View style={[s.blip, radarPoint(size, angle, radius, 44), {
    opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
  }]}>
    <Animated.View style={[s.halo, { backgroundColor: colors.success,
      opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.26] }),
      transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]} />
    <Animated.View style={[s.dot, { backgroundColor: colors.success, shadowColor: colors.success }]} />
  </Animated.View>;
}
const s = StyleSheet.create({
  blip: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: 22 },
  dot: { width: 13, height: 13, borderRadius: 7, shadowOpacity: 0.8, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }, elevation: 5 },
});
