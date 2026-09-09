import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';
import { viaLabel } from './viaLabel';
import { useAppear } from './radarMotion';

/** A computer that just appeared on the radar. It springs in, shows the address
 *  Apple resolved for it, and only becomes tappable once that address is known
 *  so a tap can never start a connection with nothing to connect to. */
export function ComputerCard({ computer, index = 0, onPress, pinned }: {
  computer: NearbyComputer; index?: number; onPress?: () => void; pinned?: boolean;
}) {
  const { colors } = useTheme();
  const still = useReducedMotion();
  const appear = useAppear(still, 90 + index * 110);
  const ready = isConnectable(computer);
  // A Host that resolved but published no identity is too old for code-free
  // pairing. Say so instead of leaving the card waiting forever.
  const older = !ready && Boolean(computer.host && computer.port) && !computer.hostId;
  const address = ready ? `${computer.host}:${computer.port}`
    : older ? 'Needs a newer Vibyra Host' : 'Announcing its address…';
  const via = viaLabel(computer.via);
  const label = ready ? `Connect to ${computer.name} at ${address}${via ? ` over ${via}` : ''}`
    : older ? `${computer.name} needs a newer Vibyra Host to connect without a code`
      : `${computer.name}, still announcing its address`;
  return <Animated.View style={{ opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
      { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }}>
    <Pressable accessibilityRole={pinned ? undefined : 'button'} accessibilityLabel={pinned ? undefined : label}
      accessibilityState={{ disabled: !ready }} disabled={pinned || !ready} onPress={onPress}
      style={({ pressed }) => [s.card, { backgroundColor: colors.surface,
        borderColor: pinned ? colors.success : colors.border, opacity: pressed ? 0.72 : 1 }]}>
      <View style={[s.badge, { backgroundColor: colors.accentSoft }]}>
        <Icon name="desktop-outline" size={23} color={colors.accent} />
      </View>
      <View style={s.detail}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{computer.name}</Text>
        <View style={s.meta}>
          <Text numberOfLines={1} style={[s.address,
            { color: ready ? colors.muted : older ? colors.warning : colors.accent }]}>{address}</Text>
          {via && <View style={[s.via, { backgroundColor: colors.elevated }]}>
            <Text style={[s.viaText, { color: colors.muted }]}>{via}</Text>
          </View>}
        </View>
      </View>
      {pinned ? <View style={[s.mark, { backgroundColor: colors.successSoft }]}>
        <Icon name="checkmark" size={16} color={colors.success} />
      </View> : ready ? <Icon name="chevron-forward" size={18} color={colors.muted} />
        : older ? <Icon name="alert-circle-outline" size={19} color={colors.warning} />
          : <ActivityIndicator color={colors.accent} />}
    </Pressable>
  </Animated.View>;
}
const s = StyleSheet.create({
  card: { minHeight: 76, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  detail: { flex: 1, gap: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  via: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  viaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  address: { flexShrink: 1, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  mark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
