import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextLink } from '../onboarding/OnboardingScaffold';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import { ComputerRow } from './ComputerRow';
import { describeSearch } from './describeSearch';
import type { NearbyComputer, SearchNetwork } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';
import { useComputerDiscovery } from './useComputerDiscovery';

// The beat between a computer landing on the list and the connection starting.
// Long enough to read what was found, short enough to feel automatic.
const HANDOFF = 1300;

/** Searches every link this phone has, the moment the screen appears — which is
 *  also what makes iOS present its Local Network alert. There is no code to
 *  enter: one resolved computer hands itself off to the connection screen, and
 *  several are offered as a list. The words carry the state; the only moving
 *  part is the system spinner that says a search is still running. */
export function DiscoveryStep({ onSelect, onBack }: {
  onSelect: (computer: NearbyComputer) => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const { status, computers, networks, elapsed, start, stop, available } = useComputerDiscovery({ auto: true });
  const looking = status === 'searching';
  const { error, run } = useAction();
  const denied = status === 'denied';
  const quiet = status === 'finished' || status === 'failed';
  const unavailable = !available || status === 'unavailable';
  const ready = computers.filter(isConnectable);
  const only = computers.length === 1 && ready.length === 1 ? ready[0] : null;
  const handoff = useRef(() => {});
  handoff.current = () => { if (only) { stop(); onSelect(only); } };
  useEffect(() => {
    if (!only) return;
    const timer = setTimeout(() => handoff.current(), HANDOFF);
    return () => clearTimeout(timer);
  }, [only?.id]);
  const copy = describeSearch({ unavailable, denied, status, computers, only, elapsed });
  return <View style={s.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={s.heading} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[s.detail, { color: colors.muted }]}>{copy.detail}</Text>
      </View>
      {looking && <ActivityIndicator color={colors.muted} style={s.spinner} />}
      {!unavailable && <Networks networks={networks} />}
      {!only && computers.length > 0 && <View style={[s.results, { borderTopColor: colors.border }]}>
        {computers.map(computer => <ComputerRow key={computer.id} computer={computer}
          onPress={() => { stop(); onSelect(computer); }} />)}
      </View>}
    </ScrollView>
    <View style={s.actions}>
      {error && <Hint error>{error}</Hint>}
      {denied ? <><Button title="Open Settings" onPress={() => { void run(() => Linking.openSettings()); }} />
        <TextLink title="Search again" onPress={start} /></>
        // Joining a network makes an unavailable search work, so offer the retry.
        : quiet || unavailable ? <Button title="Search again" onPress={start} /> : null}
      <TextLink title="Back to setup" onPress={() => { stop(); onBack(); }} />
    </View>
  </View>;
}

/** The links the search is covering, named the way someone would name them.
 *  Only shown when there is more than one, because "Wi-Fi" on its own tells
 *  nobody anything they did not already assume. Cellular appears greyed because
 *  discovery cannot run there — it is never silently implied. */
function Networks({ networks }: { networks: SearchNetwork[] }) {
  const { colors } = useTheme();
  const searched = networks.filter(network => network.searched).length;
  if (networks.length < 2 && searched === networks.length) return null;
  return <View style={s.networks} accessible accessibilityLiveRegion="polite"
    accessibilityLabel={`Searching ${searched} ${searched === 1 ? 'network' : 'networks'}: ${networks
      .map(network => `${network.label}${network.searched ? '' : ', not searched'}`).join(', ')}`}>
    {networks.map(network => <Text key={network.id}
      style={[s.network, { color: network.searched ? colors.text : colors.muted }]}>{network.label}</Text>)}
    {!searched && <Text style={[s.network, { color: colors.warning }]}>No searchable network</Text>}
  </View>;
}

const s = StyleSheet.create({
  body: { flex: 1 },
  // Top-aligned, never centred: centring a scroll container that overflows
  // pushes the title out of reach once several computers are listed.
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 8, paddingBottom: 12, gap: 20 },
  heading: { gap: 10 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.8 },
  detail: { fontSize: 15, lineHeight: 22, maxWidth: 340 },
  spinner: { alignSelf: 'flex-start' },
  networks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  network: { fontSize: 13 },
  results: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { paddingHorizontal: 26, paddingTop: 10, paddingBottom: 8, gap: 6 },
});
