import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConnectFlow } from '../connection/ConnectFlow';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from './primitives';
import { describeLocation, describePlatform, splitAddress } from './hostIdentity';
import { useAction } from './useAction';
import { confirmAction } from './confirm';
import type { WorkspaceModel } from './types';

/**
 * Remote. With no computer this is the install-then-find flow, exactly the one
 * onboarding uses. With a computer it answers "which computer am I on?": whose
 * it is and what it runs, then — only while the connection is live — where it
 * is answering from. Nothing that does not help answer that belongs here.
 */
export function ComputersScreen({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const forget = () => confirmAction('Forget this computer?',
    'Remove the saved pairing from this phone. Work on your computer continues, and you can pair it again.',
    'Forget computer', () => void run(() => workspace.actions.forgetDevice!()));
  // Finishing the flow needs no dismissal: once the computer answers, `host` is set
  // and this page becomes its details on the next render.
  if (!workspace.host) {
    return <View style={s.flow}><ConnectFlow workspace={workspace} onClose={() => {}} /></View>;
  }
  const platform = describePlatform(workspace.host.platform);
  const address = workspace.hostAddress ? splitAddress(workspace.hostAddress) : null;
  const status = workspace.demo ? 'Sample computer' : connected ? 'Connected'
    : workspace.status === 'connecting' ? 'Connecting…' : 'Not connected';
  const tone = workspace.demo ? colors.muted : connected ? colors.success
    : workspace.status === 'connecting' ? colors.accent : colors.muted;
  return <ScrollView contentContainerStyle={s.content}>
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.badge, { backgroundColor: colors.elevated }]}>
        <Icon name={platform.icon} size={30} color={colors.text} />
      </View>
      <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{workspace.host.name}</Text>
      <Text numberOfLines={1} style={[s.platform, { color: colors.muted }]}>{platform.label}
        {workspace.host.version ? ` · ${workspace.host.version}` : ''}</Text>
      <View style={s.status}>
        <View style={[s.dot, { backgroundColor: tone }]} />
        <Text style={[s.statusText, { color: tone }]}>{status}</Text>
      </View>
    </View>
    {/* Where the computer is answering from is only true while it is answering. */}
    {connected && address && <View style={[s.facts, { borderTopColor: colors.border }]}>
      <Fact label="IP address" value={address.host} suffix={address.port && `:${address.port}`} />
      <Fact label="Location" value={describeLocation(workspace.hostAddress!)} />
    </View>}
    {(error || workspace.error) && <View style={s.notice}><Hint error>{error || workspace.error}</Hint></View>}
    <View style={s.actions}>
      {connected
        ? <Button title="Disconnect" secondary busy={busy} onPress={() => void run(async () => workspace.actions.disconnect())} />
        : <Button title="Reconnect" busy={busy} disabled={!workspace.actions.reconnect}
          onPress={() => void run(workspace.actions.reconnect!)} />}
      {workspace.actions.forgetDevice && <Button title="Forget this computer" secondary disabled={busy} onPress={forget} />}
    </View>
    <Text style={[s.note, { color: colors.muted }]}>Keep your computer awake and Vibyra Host running to stay connected.</Text>
  </ScrollView>;
}
/** The port is part of the address but not part of what anyone reads, so it
 *  trails the IP quietly rather than taking a row of its own. */
function Fact({ label, value, suffix }: { label: string; value: string; suffix?: string | false }) {
  const { colors } = useTheme();
  return <View style={[s.fact, { borderBottomColor: colors.border }]}>
    <Text style={[s.factLabel, { color: colors.muted }]}>{label}</Text>
    <Text numberOfLines={1} selectable style={[s.factValue, { color: colors.text }]}>{value}
      {suffix ? <Text style={{ color: colors.muted }}>{suffix}</Text> : null}</Text>
  </View>;
}
const s = StyleSheet.create({
  flow: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 36 },
  card: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 22,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  badge: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  name: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4 },
  platform: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500' },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 24 },
  fact: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  factLabel: { fontSize: 14 }, factValue: { fontSize: 14, flexShrink: 1 },
  notice: { paddingTop: 16 }, actions: { gap: 10, paddingTop: 24 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 20 },
});
