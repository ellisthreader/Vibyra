import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { NearbyComputer } from './discoveryTypes';
import { readiness } from './nearbyPairing';

/** One computer the search found: its name, what can be done with it, and a
 *  chevron when that is "connect". Never its address, port or link type. It
 *  only becomes tappable once there is really something to connect to. */
export function ComputerRow({ computer, onPress }: { computer: NearbyComputer; onPress: () => void }) {
  const { colors } = useTheme();
  const standing = readiness(computer);
  const ready = standing === 'ready';
  // A Host too old for code-free pairing is said so, not left waiting forever.
  const older = standing === 'older';
  const state = ready ? 'Ready to connect'
    : older ? 'Update Vibyra on this computer' : 'Getting ready…';
  const label = ready ? `Connect to ${computer.name}`
    : older ? `${computer.name} needs a newer version of Vibyra`
      : `${computer.name}, getting ready`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={onPress}
    style={({ pressed }) => [s.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
    <View style={s.text}>
      <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{computer.name}</Text>
      <Text numberOfLines={1} style={[s.state, { color: older ? colors.warning : colors.muted }]}>{state}</Text>
    </View>
    {ready && <Icon name="chevron-forward" size={18} color={colors.muted} />}
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '500' },
  state: { fontSize: 13 },
});
