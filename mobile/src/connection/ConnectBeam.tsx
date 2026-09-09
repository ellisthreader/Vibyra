import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useLoop } from './radarMotion';

const TRAVEL = 1500;
const DOTS = [0, 1, 2, 3];
// A fixed track keeps the dot travel in real pixels: RN transforms cannot
// interpolate to a percentage, and the native driver needs plain numbers.
const TRACK = 118;

/** Phone and computer with traffic moving between them while the connection is
 *  being made. It stops and turns green the moment the transport reports the
 *  computer is connected, so the motion always means work in progress. */
export function ConnectBeam({ live, done, failed }: { live: boolean; done?: boolean; failed?: boolean }) {
  const { colors } = useTheme();
  const still = useReducedMotion();
  const tone = failed ? colors.error : done ? colors.success : colors.accent;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={s.beam}>
    <Pill icon="phone-portrait-outline" tone={colors.accent} />
    <View style={s.track}>
      <View style={[s.line, { backgroundColor: tone, opacity: done ? 0.5 : 0.22 }]} />
      {DOTS.map(index => <Dot key={index} index={index} tone={tone} live={live && !still && !done && !failed} />)}
      {(done || failed) && <View style={[s.centre, { backgroundColor: colors.surface, borderColor: tone }]}>
        <Icon name={failed ? 'close' : 'checkmark'} size={14} color={tone} />
      </View>}
    </View>
    <Pill icon="desktop-outline" tone={tone} />
  </View>;
}
function Pill({ icon, tone }: { icon: 'phone-portrait-outline' | 'desktop-outline'; tone: string }) {
  const { colors } = useTheme();
  return <View style={[s.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Icon name={icon} size={22} color={tone} />
  </View>;
}
function Dot({ index, tone, live }: { index: number; tone: string; live: boolean }) {
  const travel = useLoop(live, TRAVEL, (index * TRAVEL) / DOTS.length);
  return <Animated.View style={[s.dot, { backgroundColor: tone,
    opacity: live ? travel.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }) : 0,
    transform: [{ translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK - 6] }) }] }]} />;
}
const s = StyleSheet.create({
  beam: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' },
  pill: { width: 54, height: 54, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  track: { width: TRACK, height: 54, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  dot: { position: 'absolute', left: 0, width: 6, height: 6, borderRadius: 3 },
  centre: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
