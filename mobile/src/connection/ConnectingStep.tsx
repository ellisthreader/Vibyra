import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { TextLink } from '../onboarding/OnboardingScaffold';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';
import { ComputerCard } from './ComputerCard';
import { ConnectBeam } from './ConnectBeam';
import { ConnectProgress, type Stage } from './ConnectProgress';
import type { NearbyComputer } from './discoveryTypes';
import { nearbyPairingLink } from './nearbyPairing';

// Let the last step register as complete before the sheet closes itself.
const SETTLE = 900;

/** Connects to the computer discovery just found and narrates the real steps.
 *
 *  Nearby pairing carries no code, so a computer that has not seen this phone
 *  holds the handshake while its owner approves. The handshake and that
 *  approval are one round trip, so only the phone's own work spins: the
 *  approval step pulses as the thing waiting on a person. */
export function ConnectingStep({ workspace, computer, onDone, onSearch }: {
  workspace: WorkspaceModel; computer: NearbyComputer; onDone: () => void; onSearch: () => void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  // A short screen must still show Cancel or Try again without scrolling.
  const compact = height < 780;
  const { busy, error, run } = useAction();
  const attempt = useRef(() => {});
  attempt.current = () => { void run(() => workspace.actions.connect(nearbyPairingLink(computer))); };
  useEffect(() => { attempt.current(); }, [computer.id]);
  const connected = workspace.status === 'connected';
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    if (!connected) return;
    const timer = setTimeout(() => finish.current(), SETTLE);
    return () => clearTimeout(timer);
  }, [connected]);
  // `pairing` is cleared the moment the attempt fails, so remember that this
  // computer wanted an approval to keep explaining what went unanswered.
  const asked = useRef(false);
  if (workspace.status === 'pairing') asked.current = true;
  const failure = connected ? null : error || workspace.error;
  const working = busy && !connected && !failure;
  const stages = build({ computer, approval: asked.current, connected, failure, working });
  return <ScrollView showsVerticalScrollIndicator={false}
    contentContainerStyle={[s.content, compact && s.tight]}>
    <ConnectBeam live={working} done={connected} failed={Boolean(failure)} />
    <View style={s.heading} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={[s.title, compact && s.titleTight, { color: colors.text }]}>
        {connected ? 'Connected' : failure ? 'Could not connect'
          : asked.current ? 'Approve this iPhone' : `Connecting to ${computer.name}`}
      </Text>
      <Text style={[s.detail, { color: colors.muted }]}>
        {connected ? `${computer.name} is ready. Opening your workspace…`
          : failure ? 'This computer is on your Wi-Fi but did not finish the connection.'
            : asked.current ? `Open Vibyra on ${computer.name} and approve this iPhone. It keeps asking for about a minute.`
              : 'Verifying this computer and opening the encrypted channel.'}
      </Text>
    </View>
    <ComputerCard computer={computer} pinned />
    <ConnectProgress stages={stages} />
    {!failure && !compact && <View style={[s.trust, { borderColor: colors.border }]}>
      <Icon name="shield-checkmark-outline" size={18} color={colors.muted} />
      <Text style={[s.trustText, { color: colors.muted }]}>
        This computer is verified by its own key and every message is encrypted. Vibyra Desktop connections are view-only; standalone Host connections also allow commands.
      </Text>
    </View>}
    <View style={s.actions}>
      {failure ? <><Button title="Try again" icon="refresh" onPress={() => attempt.current()} />
        <TextLink title="Back to search" onPress={onSearch} /></>
        : !connected && <TextLink title="Cancel"
          onPress={() => { void workspace.actions.disconnect(); onSearch(); }} />}
      {failure && <Hint error>{failure}</Hint>}
    </View>
  </ScrollView>;
}

/** Only what the transport has actually reported. The handshake and the
 *  approval share one round trip, so neither is marked done before the
 *  computer answers, and the approval step is omitted for a phone this
 *  computer already trusts. */
function build({ computer, approval, connected, failure, working }: {
  computer: NearbyComputer; approval: boolean; connected: boolean; failure: string | null; working: boolean;
}): Stage[] {
  const stages: Stage[] = [
    // The address is already on the pinned card directly above these stages.
    { key: 'found', title: 'Found on your Wi-Fi', state: 'done' },
    { key: 'secure', title: 'Encrypted handshake',
      state: connected ? 'done' : failure ? 'failed' : working ? 'active' : 'waiting',
      detail: connected ? 'Verified this computer’s own key' : undefined },
  ];
  if (approval) {
    stages.push({ key: 'approve', title: `Approved on ${computer.name}`,
      state: connected ? 'done' : failure ? 'failed' : 'holding',
      detail: connected ? undefined : 'Waiting for someone at your computer to allow this iPhone' });
  }
  stages.push({ key: 'ready', title: 'Workspace ready', state: connected ? 'done' : 'waiting' });
  return stages;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 10, paddingBottom: 22, gap: 22 },
  tight: { paddingTop: 2, paddingBottom: 12, gap: 13 },
  heading: { gap: 10, alignItems: 'center' },
  title: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -1, textAlign: 'center' },
  titleTight: { fontSize: 24, lineHeight: 29 },
  detail: { fontSize: 15, lineHeight: 23, letterSpacing: -0.2, textAlign: 'center', maxWidth: 340 },
  trust: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth },
  trustText: { flex: 1, fontSize: 12, lineHeight: 19 },
  actions: { gap: 5, marginTop: 'auto', paddingTop: 4 },
});
