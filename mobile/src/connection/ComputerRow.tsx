import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { NearbyComputer } from './discoveryTypes';
import { readiness } from './nearbyPairing';

/** One computer the search found: its name, what can be done with it, and a
 *  chevron when that is "connect". Never its address, port or link type. It
 *  only becomes tappable once there is really something to connect to. */
export function ComputerRow({
  computer,
  onPress,
  first = true,
}: {
  computer: NearbyComputer;
  onPress: () => void;
  first?: boolean;
}) {
  const { colors } = useTheme();
  const standing = readiness(computer);
  const ready = standing === 'ready';
  // A Host too old for code-free pairing is said so, not left waiting forever.
  const older = standing === 'older';
  const state = ready
    ? 'Ready to connect'
    : older
      ? 'Update Vibyra on this computer'
      : 'Getting ready…';
  const label = ready
    ? `Connect to ${computer.name}`
    : older
      ? `${computer.name} needs a newer version of Vibyra`
      : `${computer.name}, getting ready`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        { backgroundColor: pressed ? colors.elevated : 'transparent' },
      ]}
    >
      <View style={[s.mark, { backgroundColor: colors.elevated }]}>
        <Icon name="laptop-outline" size={19} color={ready ? colors.text : colors.muted} />
      </View>
      <View style={s.text}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
          {computer.name}
        </Text>
        <Text numberOfLines={1} style={[s.state, { color: older ? colors.warning : colors.muted }]}>
          {state}
        </Text>
      </View>
      {ready && <Icon name="chevron-forward" size={16} color={colors.muted} />}
    </Pressable>
  );
}
const s = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mark: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  state: { fontSize: 13, lineHeight: 18 },
});
