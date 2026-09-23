import { memo, type Ref } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { describePlatform, guessPlatform, platformLogo } from '../ui/hostIdentity';
import { useBreath } from '../ui/motion';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NearbyComputer } from './discoveryTypes';
import { FoundMachine } from './FoundMachine';
import { useArrival } from './foundMotion';

/** The one computer a search found, put to the person to confirm before
 *  anything connects. The machine itself is the answer (`FoundMachine`), drawn
 *  as the computer it is, and under it its name, set like the label under a
 *  device rather than a row in a list: the platform's logo before the name,
 *  one status line and a live dot. The family comes from the Host itself, or
 *  failing that from its name (`guessPlatform`), so a Desktop built before the
 *  advertisement said it is still drawn as the Mac its name says it is. Never
 *  its address, port or link type: the name is what someone recognises. The
 *  words rise as the lid lands, so the picture is read in the order it happens.
 *  Memoised on what it draws: the search behind it keeps reporting, and a
 *  re-render would hand the arrival back to its drivers half way through. */
export const FoundComputer = memo(function FoundComputer({
  computer,
  compact,
  stageRef,
  labelOpacity,
}: {
  computer: NearbyComputer;
  compact: boolean;
  stageRef?: Ref<View>;
  labelOpacity?: Animated.Value;
}) {
  const { colors } = useTheme();
  const still = useReducedMotion();
  const motion = useArrival(still);
  const pulse = useBreath(!still, 2600);
  const width = compact ? 196 : 252;
  const platform = computer.platform ?? guessPlatform(computer.name, computer.host);
  const logo = platformLogo(platform);
  const family = logo ? `, ${describePlatform(platform).label}` : '';
  return (
    <View style={s.found}>
      <View
        ref={stageRef}
        collapsable={false}
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[s.stage, { width, height: width * 0.84 }]}
      >
        <FoundMachine width={width} motion={motion} logo={logo} />
      </View>
      <Animated.View
        accessible
        accessibilityLabel={`${computer.name}${family}, ready to connect`}
        style={[
          s.plate,
          {
            opacity: labelOpacity ? Animated.multiply(motion.settle, labelOpacity) : motion.settle,
            transform: [
              {
                translateY: motion.settle.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
              },
            ],
          },
        ]}
      >
        <View style={s.title}>
          {logo && <Icon name={logo} size={20} color={colors.muted} />}
          <Text numberOfLines={2} style={[s.name, { color: colors.text }]}>
            {computer.name}
          </Text>
        </View>
        <View style={s.status}>
          <View style={s.well}>
            <Animated.View
              style={[
                s.halo,
                {
                  backgroundColor: colors.success,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) },
                  ],
                },
              ]}
            />
            <View style={[s.dot, { backgroundColor: colors.success }]} />
          </View>
          <Text style={[s.state, { color: colors.muted }]}>Ready to connect</Text>
        </View>
      </Animated.View>
    </View>
  );
});
const s = StyleSheet.create({
  found: { gap: 6 },
  stage: { alignSelf: 'center', justifyContent: 'flex-start' },
  plate: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  name: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '600',
    letterSpacing: -0.5,
    textAlign: 'center',
    flexShrink: 1,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  well: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { fontSize: 14 },
});
