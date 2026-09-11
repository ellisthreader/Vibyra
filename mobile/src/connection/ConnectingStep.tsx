import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextLink } from '../onboarding/OnboardingScaffold';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';
import type { NearbyComputer } from './discoveryTypes';
import { nearbyPairingLink } from './nearbyPairing';

// Let the last step register as complete before the sheet closes itself.
const SETTLE = 900;
type StepState = 'done' | 'active' | 'holding' | 'waiting' | 'failed';
interface Step { key: string; title: string; detail?: string; state: StepState }

/** Connects to the computer discovery just found and narrates the real steps.
 *
 *  Nearby pairing carries no code, so a computer that has not seen this phone
 *  holds the handshake while its owner approves. The steps are plain lines of
 *  text: a tick for what is finished, a spinner for the one thing actually
 *  running, nothing at all for what has not started. */
export function ConnectingStep({ workspace, computer, onDone, onSearch }: {
  workspace: WorkspaceModel; computer: NearbyComputer; onDone: () => void; onSearch: () => void;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const attempt = useRef(() => {});
  const connection = useRef({ connected: false, disconnect: workspace.actions.disconnect });
  connection.current = { connected: workspace.status === 'connected', disconnect: workspace.actions.disconnect };
  attempt.current = () => { void run(() => workspace.actions.connect(nearbyPairingLink(computer))); };
  useEffect(() => {
    attempt.current();
    return () => {
      // Closing the sheet must cancel an outstanding approval/handshake.
      // A successful handoff keeps the established workspace connection.
      if (!connection.current.connected) void connection.current.disconnect();
    };
  }, [computer.id]);
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
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
    <View style={s.heading} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
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
    <View style={s.steps}>
      {build({ computer, approval: asked.current, connected, failure, working })
        .map(step => <Row key={step.key} step={step} />)}
    </View>
    <View style={s.actions}>
      {/* What went wrong reads above the button that retries it. */}
      {failure && <Hint error>{failure}</Hint>}
      {failure ? <><Button title="Try again" onPress={() => attempt.current()} />
        <TextLink title="Back to search" onPress={onSearch} /></>
        : !connected && <TextLink title="Cancel"
          onPress={() => { void workspace.actions.disconnect(); onSearch(); }} />}
    </View>
  </ScrollView>;
}

/** One line per step. `active` is work the phone is doing, so it spins;
 *  `holding` is work only the person at the computer can finish, so it says so
 *  rather than pretending to make progress. */
function Row({ step }: { step: Step }) {
  const { colors } = useTheme();
  const tone = step.state === 'failed' ? colors.error : step.state === 'done' ? colors.success : colors.muted;
  const status = step.state === 'done' ? 'completed' : step.state === 'failed' ? 'failed'
    : step.state === 'holding' ? 'waiting for you' : step.state === 'active' ? 'in progress' : 'not started';
  return <View style={s.step} accessible
    accessibilityLabel={`${step.title}, ${status}${step.detail ? `. ${step.detail}` : ''}`}>
    <View style={s.mark}>
      {step.state === 'active' ? <ActivityIndicator size="small" color={colors.muted} />
        : step.state === 'done' ? <Icon name="checkmark" size={16} color={colors.success} />
          : step.state === 'failed' ? <Icon name="close" size={16} color={colors.error} /> : null}
    </View>
    <View style={s.stepText}>
      <Text style={[s.stepTitle, { color: step.state === 'waiting' ? colors.muted : colors.text }]}>{step.title}</Text>
      {step.detail && <Text style={[s.stepDetail, { color: step.state === 'failed' ? tone : colors.muted }]}>
        {step.detail}</Text>}
    </View>
  </View>;
}

/** Only what the transport has actually reported. The handshake and the
 *  approval share one round trip, so neither is marked done before the
 *  computer answers, and the approval step is omitted for a phone this
 *  computer already trusts. */
function build({ computer, approval, connected, failure, working }: {
  computer: NearbyComputer; approval: boolean; connected: boolean; failure: string | null; working: boolean;
}): Step[] {
  const steps: Step[] = [
    { key: 'found', title: 'Found your computer', detail: computer.name, state: 'done' },
    { key: 'secure', title: 'Connecting securely',
      state: connected ? 'done' : failure ? 'failed' : working ? 'active' : 'waiting',
      detail: connected ? 'This computer verified itself' : undefined },
  ];
  if (approval) {
    steps.push({ key: 'approve',
      title: connected ? `Approved on ${computer.name}` : `Allow this iPhone on ${computer.name}`,
      state: connected ? 'done' : failure ? 'failed' : 'holding',
      detail: connected ? undefined : 'Go to your computer and allow it' });
  }
  steps.push({ key: 'ready', title: 'Ready', state: connected ? 'done' : 'waiting' });
  return steps;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 8, paddingBottom: 16, gap: 24 },
  heading: { gap: 10 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.8 },
  detail: { fontSize: 15, lineHeight: 22, maxWidth: 340 },
  steps: { gap: 14 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mark: { width: 20, minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, lineHeight: 22 },
  stepDetail: { fontSize: 13, lineHeight: 19 },
  actions: { gap: 6, marginTop: 'auto' },
});
