import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TextLink } from '../onboarding/OnboardingScaffold';
import { Button, Hint } from '../ui/primitives';
import { ConnectionProgress } from './ConnectionProgress';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';
import type { NearbyComputer } from './discoveryTypes';
import { nearbyPairingLink } from './nearbyPairing';
import { GUTTER } from '../ui/font';

// Let the last step register as complete before the sheet closes itself.
const SETTLE = 1200;
/** Owns the real handshake and cancellation; ConnectionProgress presents its state. */
export function ConnectingStep({
  workspace,
  computer,
  cloud,
  onDone,
  onSearch,
}: {
  workspace: WorkspaceModel;
  computer: NearbyComputer;
  cloud?: () => Promise<unknown>;
  onDone: () => void;
  onSearch: () => void;
}) {
  const { busy, error, run } = useAction();
  const attempt = useRef(() => {});
  const connection = useRef({ connected: false, disconnect: workspace.actions.disconnect });
  connection.current = {
    connected: workspace.status === 'connected',
    disconnect: workspace.actions.disconnect,
  };
  attempt.current = () => {
    void run(cloud ?? (() => workspace.actions.connect(nearbyPairingLink(computer))));
  };
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
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <ConnectionProgress
        name={computer.name}
        cloud={Boolean(cloud)}
        stage={
          connected ? 'connected' : failure ? 'failed' : asked.current ? 'approval' : 'connecting'
        }
        working={working}
      />
      <View style={s.actions}>
        {/* What went wrong reads above the button that retries it. */}
        {failure && <Hint error>{failure}</Hint>}
        {failure ? (
          <>
            <Button title="Try again" onPress={() => attempt.current()} />
            <TextLink title={cloud ? 'Back' : 'Back to search'} onPress={onSearch} />
          </>
        ) : (
          !connected && (
            <TextLink
              title="Cancel"
              onPress={() => {
                void workspace.actions.disconnect();
                onSearch();
              }}
            />
          )
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 16, gap: 24 },
  actions: { gap: 6, marginTop: 'auto' },
});
