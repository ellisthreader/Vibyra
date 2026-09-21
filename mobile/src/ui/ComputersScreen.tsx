import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConnectFlow } from '../connection/ConnectFlow';
import { useTheme } from '../theme';
import { ComputerFigure } from './ComputerFigure';
import { confirmAction } from './confirm';
import { describeLocation, describePlatform, displayAddress, onThisDevice } from './hostIdentity';
import { useWhereabouts } from './hostLocation';
import { describeConnection } from './hostStatus';
import { Button, Hint, Icon } from './primitives';
import type { WorkspaceModel } from './types';
import { useAction } from './useAction';
import { clearDrafts } from './useDraft';

/**
 * Remote. With no computer this is the install-then-find flow, exactly the one
 * onboarding uses. With a computer it answers "which computer am I on?": the
 * computer itself, drawn with its screen showing whether it is answering, then
 * whose it is and what it runs, and — only while the connection is live —
 * where it is answering from. Nothing that does not help answer that belongs here.
 */
export function ComputersScreen({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  // The flow finishes on its own terms, not the moment `host` is set. The store
  // names the computer one render before it reports `connected`, and a
  // `ConnectingStep` unmounted on that render cancels the handshake it has just
  // completed — so the flow stays until it has rendered the connection itself.
  const [flow, setFlow] = useState(!workspace.host);
  useEffect(() => { if (!workspace.host) setFlow(true); }, [workspace.host]);
  useEffect(() => { if (connected) setFlow(false); }, [connected]);
  if (!workspace.host || flow) {
    return <View style={s.flow}><ConnectFlow workspace={workspace} onClose={() => setFlow(false)} /></View>;
  }
  const platform = describePlatform(workspace.host.platform);
  const words = describeConnection(workspace);
  const tone = colors[words.tone];
  const live = connected && workspace.hostAddress;
  const cloud = connected && workspace.throughCloud;
  // The one Forget left now Settings has none, so it also clears what Settings' did:
  // drafts typed for that computer's sessions must not outlive its pairing.
  const forget = () => confirmAction('Forget this computer?',
    'Remove the saved pairing and unsent drafts from this phone. Work on your computer continues, and you can pair it again.',
    'Forget computer', () => void run(async () => { await workspace.actions.forgetDevice!(); clearDrafts(); }));
  return <ScrollView contentContainerStyle={s.content}>
    <ComputerFigure state={words.figure} logo={platform.icon} />
    <View style={s.identity}>
      <Text accessibilityRole="header" numberOfLines={2} style={[s.name, { color: colors.text }]}>{workspace.host.name}</Text>
      <View style={s.platform}>
        <Icon name={platform.icon} size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[s.platformText, { color: colors.muted }]}>{platform.label}</Text>
      </View>
      {/* The one moving thing while the computer is being reached is the spinner
          on its screen; here the words change and the dot takes the tone. */}
      <View style={s.status} accessibilityLiveRegion="polite">
        <View style={[s.dot, { backgroundColor: tone }]} />
        <Text style={[s.statusText, { color: tone }]}>{words.label}</Text>
      </View>
    </View>
    {/* What it runs is a saved fact; where it is answering from is only true
        while it is answering. */}
    {(workspace.host.version || live || cloud) && <View style={[s.facts, { borderTopColor: colors.border }]}>
      {workspace.host.version && <Fact label="Vibyra version" value={workspace.host.version} />}
      {live && <AddressFacts address={live} />}
      {/* Through the cloud the phone only knows the relay's address, which says
          nothing about where the computer is; the route is the honest fact. */}
      {cloud && <Fact label="Connection" value="Through Vibyra Cloud" />}
    </View>}
    {/* The status line has already said something is wrong; the detail under it
        says what, in a quieter voice. Only a failed press here is an error hint. */}
    {error ? <View style={s.notice}><Hint error>{error}</Hint></View>
      : words.problem ? <View style={s.notice}><Hint>{words.problem}</Hint></View> : null}
    <View style={s.actions}>
      {connected
        ? <Button title="Disconnect" secondary busy={busy} onPress={() => void run(async () => workspace.actions.disconnect())} />
        : <Button title="Reconnect" disabled={busy || words.working || !workspace.actions.reconnect}
          onPress={() => void run(workspace.actions.reconnect!)} />}
      {workspace.actions.forgetDevice && <Pressable accessibilityRole="button" accessibilityLabel="Forget this computer"
        aria-disabled={busy} accessibilityState={{ disabled: busy }} disabled={busy} onPress={forget}
        style={({ pressed }) => [s.forget, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[s.forgetText, { color: colors.muted }]}>Forget this computer</Text>
      </Pressable>}
    </View>
    <Text style={[s.note, { color: colors.muted }]}>{connected
      ? 'Keep your computer awake and Vibyra Host running to stay connected.'
      : workspace.throughCloud ? 'Open Vibyra on your computer and keep it awake. Any network will do.'
        : 'Open Vibyra Host on your computer and keep both devices on the same Wi-Fi.'}</Text>
  </ScrollView>;
}
/** Where the computer answers from. The IP is the one the phone reached it on,
 *  unless that is loopback: the Simulator on the Mac it runs on reaches it at
 *  `::1`, which names no network at all, so the row shows the public IP the
 *  lookup saw instead — that Mac's own address on the internet. Location comes
 *  from the same lookup (`hostLocation.ts`): quiet until it answers, then the
 *  place, or which network the computer answers on when nothing could say. */
function AddressFacts({ address }: { address: string }) {
  const found = useWhereabouts(address);
  const asking = found === undefined;
  const local = onThisDevice(address);
  const ip = local ? found?.ip : displayAddress(address);
  return <>
    {ip ? <Fact label={local ? 'Public IP' : 'IP address'} value={ip} long={ip.includes(':')} />
      : local && asking ? <Fact label="Public IP" value="Locating…" quiet /> : null}
    <Fact label="Location" quiet={asking} value={asking ? 'Locating…' : found?.place ?? describeLocation(address)} />
  </>;
}
/** A label and its value on one line. A value that cannot fit beside its label
 *  — a full IPv6 address is 39 characters — goes under it at full width, so it
 *  is read whole instead of cut short mid-address. */
function Fact({ label, value, quiet, long }: { label: string; value: string; quiet?: boolean; long?: boolean }) {
  const { colors } = useTheme();
  return <View style={[s.fact, long && s.factLong, { borderBottomColor: colors.border }]}>
    <Text style={[s.factLabel, { color: colors.muted }]}>{label}</Text>
    <Text numberOfLines={long ? 2 : 1} selectable
      style={[s.factValue, { color: quiet ? colors.muted : colors.text }]}>{value}</Text>
  </View>;
}
const s = StyleSheet.create({
  flow: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 36 },
  identity: { paddingTop: 28 },
  name: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.8 },
  platform: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  platformText: { fontSize: 15, lineHeight: 21, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, minHeight: 22 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 26 },
  fact: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  factLong: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, paddingVertical: 12 },
  factLabel: { fontSize: 15 }, factValue: { fontSize: 15, flexShrink: 1 },
  notice: { paddingTop: 16 },
  actions: { gap: 4, paddingTop: 26 },
  forget: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  forgetText: { fontSize: 15, fontWeight: '500' },
  note: { fontSize: 13, lineHeight: 19, marginTop: 14 },
});
