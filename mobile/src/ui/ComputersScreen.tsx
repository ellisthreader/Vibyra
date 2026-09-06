import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon, IconButton, SectionLabel } from './primitives';
import { useAction } from './useAction';
import type { WorkspaceModel } from './types';

export function ComputersScreen({ workspace, onConnect }: { workspace: WorkspaceModel; onConnect: () => void }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const revoke = (id: string, name: string) => Alert.alert(`Remove ${name}?`,
    'This device will need to pair again before it can access this computer.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Remove device', style: 'destructive',
        onPress: () => void run(() => workspace.actions.revokeDevice!(id)) },
    ]);
  return <ScrollView contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Computers</Text>
    {!workspace.host ? <EmptyState icon="desktop-outline" title="Bring your workspace with you"
      detail="Connect your computer to access its projects, coding agents, and terminals from your iPhone.">
      <Button title="Connect a computer" icon="add" onPress={onConnect} />
    </EmptyState> : <>
      <View style={[s.computer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.computerIcon, { backgroundColor: colors.elevated }]}><Icon name="desktop-outline" size={36} /></View>
        <Text style={[s.name, { color: colors.text }]}>{workspace.host.name}</Text>
        <View style={s.state}><View style={[s.dot, { backgroundColor: connected ? colors.success : colors.muted }]} />
          <Text style={[s.stateText, { color: connected ? colors.success : colors.muted }]}>{connected ? 'Connected' : 'Disconnected'}</Text></View>
        <Text style={[s.platform, { color: colors.muted }]}>{workspace.host.platform}{workspace.host.version ? ` · Host ${workspace.host.version}` : ''}</Text>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <View style={s.privacy}><Icon name="lock-closed-outline" size={17} color={colors.muted} />
          <Text style={[s.privacyText, { color: colors.muted }]}>End-to-end encrypted connection</Text></View>
        <View style={s.button}>{connected ? <Button title="Disconnect" secondary busy={busy}
          onPress={() => void run(async () => workspace.actions.disconnect())} /> : <Button title="Reconnect" onPress={onConnect} />}</View>
      </View>
      <Hint>Disconnecting your phone leaves accepted work running on your computer. Keep the computer awake and connected.</Hint>
      <SectionLabel>Trusted devices</SectionLabel>
      {workspace.devices.length === 0 ? <Hint>Connect to view this computer’s trusted devices.</Hint> :
        <View style={[s.devices, { backgroundColor: colors.surface }]}>{workspace.devices.map(device =>
          <View key={device.id} style={[s.device, { borderBottomColor: colors.border }]}>
            <Icon name="phone-portrait-outline" size={22} color={colors.muted} />
            <View style={s.deviceText}><Text style={[s.deviceName, { color: colors.text }]}>{device.name}</Text>
              {device.current && <Text style={[s.current, { color: colors.muted }]}>This device</Text>}</View>
            {workspace.actions.revokeDevice && connected && <IconButton icon="trash-outline" label={`Remove ${device.name}`}
              disabled={busy} onPress={() => revoke(device.id, device.name)} />}
          </View>)}</View>}
      <View style={s.button}><Button title="Pair another computer" secondary icon="add" onPress={onConnect} /></View>
      <Hint>You control which computer is connected. Pairing another computer switches the current workspace.</Hint>
    </>}
    {(error || workspace.error) && <Hint error>{error || workspace.error}</Hint>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40, gap: 18 }, title: { fontSize: 29, fontWeight: '600', letterSpacing: -0.8, marginBottom: 7 },
  computer: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 25, padding: 24, gap: 14 },
  computerIcon: { width: 79, height: 79, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  name: { fontSize: 23, fontWeight: '600', textAlign: 'center', letterSpacing: -0.5 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 6, height: 6, borderRadius: 3 }, stateText: { fontSize: 13, fontWeight: '500' },
  platform: { fontSize: 12, textAlign: 'center' }, divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 5 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8 }, privacyText: { fontSize: 13, flexShrink: 1 },
  button: { alignSelf: 'stretch', marginTop: 4 }, devices: { borderRadius: 18, overflow: 'hidden' },
  device: { minHeight: 70, paddingLeft: 18, paddingRight: 10, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  deviceText: { flex: 1, gap: 5 }, deviceName: { fontSize: 15, fontWeight: '500' }, current: { fontSize: 12 },
});
