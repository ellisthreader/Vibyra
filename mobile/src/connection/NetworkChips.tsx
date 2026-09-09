import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NetworkKind, SearchNetwork } from './discoveryTypes';
import { useLoop } from './radarMotion';

const PULSE = 1700;
const icons: Record<NetworkKind, IconName> = {
  wifi: 'wifi', direct: 'radio-outline', wired: 'git-network-outline', shared: 'share-social-outline',
  vpn: 'lock-closed-outline', other: 'globe-outline', cellular: 'cellular-outline',
};

/** Shows every link the search is covering at once, so a live search reads as
 *  spanning networks rather than one Wi-Fi. Cellular appears greyed because
 *  multicast discovery does not run there — it is never silently implied. */
export function NetworkChips({ networks, live }: { networks: SearchNetwork[]; live: boolean }) {
  const { colors } = useTheme();
  if (!networks.length) return null;
  const searched = networks.filter(network => network.searched).length;
  return <View style={s.row} accessible accessibilityLiveRegion="polite"
    accessibilityLabel={`Searching ${searched} ${searched === 1 ? 'network' : 'networks'}: ${networks
      .map(network => `${network.label}${network.searched ? '' : ', not searched'}`).join(', ')}`}>
    {networks.map((network, index) => <Chip key={network.id} network={network}
      live={live && network.searched} index={index} />)}
    {!searched && <Text style={[s.none, { color: colors.warning }]}>No searchable network</Text>}
  </View>;
}
function Chip({ network, live, index }: { network: SearchNetwork; live: boolean; index: number }) {
  const { colors } = useTheme();
  const still = useReducedMotion();
  const pulse = useLoop(live && !still, PULSE, (index * PULSE) / 3);
  const tone = network.searched ? colors.accent : colors.muted;
  return <View style={[s.chip, { borderColor: network.searched ? colors.border : 'transparent',
    backgroundColor: network.searched ? colors.surface : 'transparent' }]}>
    <View style={s.mark}>
      {live && <Animated.View style={[s.halo, { backgroundColor: tone,
        opacity: pulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.34, 0, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.6] }) }] }]} />}
      <View style={[s.dot, { backgroundColor: tone, opacity: network.searched ? 1 : 0.5 }]} />
    </View>
    <Icon name={icons[network.kind]} size={12} color={tone} />
    <Text style={[s.label, { color: network.searched ? colors.text : colors.muted }]}>{network.label}</Text>
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11 },
  mark: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
  none: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4, alignSelf: 'center' },
});
