import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { TextLink } from '../onboarding/OnboardingScaffold';
import { useTheme } from '../theme';
import { useAppear } from '../ui/motion';
import { Button, Hint } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { MachineFrame } from './ComputerHandoff';
import { ComputerRow } from './ComputerRow';
import { describeSearch } from './describeSearch';
import type { NearbyComputer, SearchNetwork } from './discoveryTypes';
import { FoundComputer } from './FoundComputer';
import { isConnectable } from './nearbyPairing';
import { SearchSignal, type SignalMode } from './SearchSignal';
import { useComputerDiscovery } from './useComputerDiscovery';
import { font, GUTTER } from '../ui/font';

// Every search is seen to happen: its answer, found or not, waits this long, so
// a computer that replies at once still reads as "looked, then found".
const MIN_SEARCH = 2500;

/** Searches every link this phone has, the moment the screen appears — which is
 *  also what makes iOS present its Local Network alert. There is no code to
 *  enter. The search shows for at least MIN_SEARCH; then one resolved computer
 *  is put to the person to confirm and several are offered as a list. Nothing
 *  connects until someone picks. The words carry the state, and the signal art
 *  under them is its live face: rings leave the phone only while a search is
 *  genuinely running, a found computer lands on the ring and answers, and the
 *  art rests still when there is nothing to look for. One computer to confirm
 *  takes the stage over (`FoundComputer`): the laptop from the ring, up close
 *  and opening, so finding is seen as well as read. */
export function DiscoveryStep({ onSelect, onBack }: {
  onSelect: (computer: NearbyComputer, frame?: MachineFrame) => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const still = useReducedMotion();
  const departure = useRef(new Animated.Value(1)).current;
  const stageRef = useRef<View>(null);
  const choosing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; departure.stopAnimation(); }; }, [departure]);
  const discovery = useComputerDiscovery({ auto: true });
  const { networks, elapsed, start, stop, available } = discovery;
  const { error, run } = useAction();
  const [round, setRound] = useState(0);
  const [held, setHeld] = useState(true);
  // "Not my computer" hides it for as long as this screen is open, later searches included.
  const [rejected, setRejected] = useState<string[]>([]);
  useEffect(() => {
    setHeld(true);
    const timer = setTimeout(() => setHeld(false), MIN_SEARCH);
    return () => clearTimeout(timer);
  }, [round]);
  const denied = discovery.status === 'denied';
  const unavailable = !available || discovery.status === 'unavailable';
  // Being blocked is said at once; only the answer to a search waits.
  const holding = held && !denied && !unavailable;
  const status = holding ? 'searching' : discovery.status;
  const computers = holding ? [] : discovery.computers.filter(computer => !rejected.includes(computer.id));
  const quiet = status === 'finished' || status === 'failed';
  const ready = computers.filter(isConnectable);
  const single = computers.length === 1 && ready.length === 1 ? ready[0] : null;
  const [only, forget] = useConfirming(single, computers);
  const again = () => { forget(); setRound(value => value + 1); start(); };
  const choose = (computer: NearbyComputer) => {
    if (choosing.current) return;
    choosing.current = true;
    stop();
    const selected = (frame?: MachineFrame) => {
      if (!mounted.current) return;
      if (still) { onSelect(computer, frame); return; }
      Animated.timing(departure, { toValue: 0, duration: 140, useNativeDriver: true, isInteraction: false })
        .start(({ finished }) => { if (finished && mounted.current) onSelect(computer, frame); });
    };
    if (only?.id === computer.id && stageRef.current) {
      stageRef.current.measureInWindow((x, y, width, height) => selected(width > 0 ? { x, y, width, height } : undefined));
    } else selected();
  };
  // Found means connectable: a computer still being resolved keeps the phone calling.
  const mode: SignalMode = unavailable || quiet ? 'quiet' : denied ? 'blocked'
    : ready.length ? 'found' : 'searching';
  const copy = describeSearch({ unavailable, denied, status, computers, only, elapsed });
  return <View style={s.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Animated.View style={{ opacity: departure }}><Heading key={copy.title} title={copy.title} detail={copy.detail} /></Animated.View>
      {only ? <FoundComputer key={only.id} computer={only} compact={compact} stageRef={stageRef} labelOpacity={departure} /> : <>
        <View style={s.stage}>
          <SearchSignal mode={mode} computers={computers} size={compact ? 172 : 224} />
        </View>
        {!unavailable && <Networks networks={networks} />}
        {computers.length > 0 && <View style={[s.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {computers.map((computer, index) => <ComputerRow key={computer.id} computer={computer} first={index === 0}
            onPress={() => choose(computer)} />)}
        </View>}
      </>}
    </ScrollView>
    <Animated.View style={[s.actions, { opacity: departure }]}>
      {error && <Hint error>{error}</Hint>}
      {only ? <><Button title="Yes, connect" onPress={() => choose(only)} />
        <TextLink title="Not my computer"
          onPress={() => { forget(); setRejected(ids => [...ids, only.id]); }} /></>
        : denied ? <><Button title="Open Settings" onPress={() => { void run(() => Linking.openSettings()); }} />
          <TextLink title="Search again" onPress={again} /></>
          // Joining a network makes an unavailable search work, so offer the retry.
          : quiet || unavailable ? <Button title="Search again" onPress={again} /> : null}
      {/* Confirming is a yes or no; setup is back in reach the moment it is a no. */}
      {!only && <TextLink title="Back to setup" onPress={() => { stop(); onBack(); }} />}
    </Animated.View>
  </View>;
}

/** The computer put to the person, held steady while the search carries on
 *  around it. A live search re-reports constantly — Bonjour emits again on
 *  every browse and network change, a Host re-resolving loses its address for
 *  a beat, and the fallback sweep drops anything that missed a pass — so the
 *  computer someone is reading would otherwise be withdrawn and put back every
 *  few seconds, replaying its arrival and its haptic each time. It is taken
 *  away only when there is something to say: another computer to choose
 *  between, a turn down, or a fresh search. Its details still follow the
 *  search, so a connection always uses the endpoint last reported, and the
 *  object only changes when one of them does — the art it drives is memoised
 *  on it. */
const STICKY = false; // TEMPORARY A/B — restore to true
function useConfirming(found: NearbyComputer | null, computers: NearbyComputer[]) {
  const [held, setHeld] = useState<NearbyComputer | null>(null);
  useEffect(() => {
    if (found) setHeld(previous => (previous && unchanged(previous, found) ? previous : found));
  }, [found]);
  const others = computers.some(computer => computer.id !== held?.id);
  return [STICKY ? (held && !others ? held : null) : found, useCallback(() => setHeld(null), [])] as const;
}

const unchanged = (a: NearbyComputer, b: NearbyComputer) => a.id === b.id && a.name === b.name
  && a.hostId === b.hostId && a.host === b.host && a.port === b.port && a.platform === b.platform;

/** The title and its line. Keyed on the title by the caller, so a change of
 *  state — looking, then found — is a change someone sees: the new words rise
 *  into place as the picture under them changes. */
function Heading({ title, detail }: { title: string; detail: string }) {
  const { colors } = useTheme();
  const appear = useAppear(useReducedMotion());
  return <Animated.View style={[s.heading, { opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    accessibilityLiveRegion="polite">
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
    <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
  </Animated.View>;
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
  content: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 12, gap: 20 },
  heading: { gap: 8 },
  title: { ...font.title, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  detail: { ...font.subhead, fontSize: 15, lineHeight: 21, maxWidth: 340 },
  stage: { alignItems: 'center', paddingVertical: 4 },
  networks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  network: { ...font.footnote, fontWeight: '500' },
  results: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  actions: { paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 8, gap: 6 },
});
