import { useEffect, useRef } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEntrance } from '../onboarding/welcomeMotion';
import { useTheme } from '../theme';
import { Hint, Icon, type IconName } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import { ComputerCard } from './ComputerCard';
import { describeSearch } from './describeSearch';
import type { NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';
import { NetworkChips } from './NetworkChips';
import { RadarScan, type RadarMode } from './RadarScan';
import { useComputerDiscovery } from './useComputerDiscovery';

// The beat between a computer landing on the radar and the connection starting.
// Long enough to read what was found, short enough to feel automatic.
const HANDOFF = 1300;

/** Searches every link this phone has, the moment the screen appears — which is
 *  also what makes iOS present its Local Network alert. There is no code to
 *  enter: one resolved computer hands itself off to the connection screen, and
 *  several are offered as a choice. */
export function DiscoveryStep({ onSelect, onBack }: {
  onSelect: (computer: NearbyComputer) => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const { status, computers, networks, elapsed, start, stop, available } = useComputerDiscovery({ auto: true });
  const { error, run } = useAction();
  const [head, stage, list, actions] = useEntrance(4);
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
  const mode: RadarMode = unavailable || quiet ? 'quiet' : denied ? 'blocked'
    : computers.length ? 'found' : 'searching';
  const copy = describeSearch({ unavailable, denied, status, computers, only, elapsed, networks });
  return <View style={s.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, compact && s.tight]}>
      <Animated.View style={[s.heading, head]} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[s.title, compact && s.titleTight, { color: colors.text }]}>
          {copy.lead}{'\n'}<Text style={{ color: mode === 'found' ? colors.success : colors.accent }}>{copy.accent}</Text>
        </Text>
        <Text style={[s.detail, { color: colors.muted }]}>{copy.detail}</Text>
      </Animated.View>
      <Animated.View style={[s.stage, stage]}>
        <RadarScan mode={mode} computers={computers} size={compact ? 172 : 224} />
      </Animated.View>
      <Animated.View style={[s.middle, list]}>
        {!unavailable && <NetworkChips networks={networks} live={status === 'searching'} />}
        {status === 'searching' && !computers.length && <Text style={[s.ticker, { color: colors.muted }]}>
          {elapsed}s · listening for Vibyra Host
        </Text>}
        {!only && computers.length > 0 && <View style={s.results}>
          {computers.map((computer, index) => <ComputerCard key={computer.id} computer={computer} index={index}
            onPress={() => { stop(); onSelect(computer); }} />)}
        </View>}
      </Animated.View>
    </ScrollView>
    <Animated.View style={[s.actions, { backgroundColor: colors.background }, actions]}>
      {denied ? <Primary title="Open Settings" icon="settings-outline"
        onPress={() => { void run(() => Linking.openSettings()); }} />
        : quiet ? <Primary title="Search again" icon="refresh" onPress={start} /> : null}
      {error && <Hint error>{error}</Hint>}
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { stop(); onBack(); }}
        style={({ pressed }) => [s.back, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[s.backText, { color: colors.muted }]}>Back</Text>
      </Pressable>
    </Animated.View>
  </View>;
}

function Primary({ title, icon, onPress }: { title: string; icon: IconName; onPress: () => void }) {
  const { colors } = useTheme();
  return <View style={[s.glow, { shadowColor: colors.accent }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => [s.primary, { backgroundColor: colors.action, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name={icon} size={18} color={colors.onAction} />
      <Text style={[s.primaryText, { color: colors.onAction }]}>{title}</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 4, paddingBottom: 10, gap: 16 },
  tight: { paddingTop: 0, gap: 10 },
  heading: { gap: 11 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1.3 },
  titleTight: { fontSize: 29, lineHeight: 33 },
  detail: { fontSize: 15, lineHeight: 22, letterSpacing: -0.2, maxWidth: 330 },
  stage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 },
  middle: { gap: 14 },
  ticker: { fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: -0.1, textAlign: 'center' },
  results: { gap: 10 },
  actions: { paddingHorizontal: 26, paddingTop: 10, paddingBottom: 8, gap: 6 },
  glow: { borderRadius: 18, shadowOpacity: 0.32, shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  primary: { minHeight: 56, borderRadius: 18, paddingHorizontal: 22, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { flexShrink: 1, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '500' },
});
