import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon, IconButton } from './primitives';
import { useAction } from './useAction';
import { confirmAction } from './confirm';
import type { WorkspaceModel } from './types';

export function ComputersScreen({ workspace, onConnect }: { workspace: WorkspaceModel; onConnect: () => void }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const revoke = (id: string, name: string) => confirmAction(`Remove ${name}?`,
    'This device will need to pair again before it can access this computer.',
    'Remove device', () => void run(() => workspace.actions.revokeDevice!(id)));
  return <ScrollView contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Computers</Text>
    {!workspace.host ? <EmptyState icon="desktop-outline" title="No computer connected"
      detail="Connect Vibyra Host to access your chats, terminals, and projects.">
      <Button title="Connect computer" icon="add" onPress={onConnect} />
    </EmptyState> : <>
      <Text style={[s.section, { color: colors.muted }]}>Current computer</Text>
      <View style={[s.host, { borderColor: colors.border }]}>
        <View style={s.hostHeading}><View style={[s.hostIcon, { backgroundColor: colors.elevated }]}><Icon name="desktop-outline" size={25} /></View>
          <View style={s.hostText}><Text style={[s.name, { color: colors.text }]}>{workspace.host.name}</Text>
            <Text style={[s.platform, { color: colors.muted }]}>{workspace.host.platform}{workspace.host.version ? ` · ${workspace.host.version}` : ''}</Text></View>
        </View>
        <View style={[s.hostFooter, { borderTopColor: colors.border }]}>
          <View style={s.state}><View style={[s.dot, { backgroundColor: workspace.demo ? colors.muted : connected ? colors.success : colors.muted }]} />
            <Text style={[s.stateText, { color: colors.muted }]}>{workspace.demo ? 'Sample computer' : connected ? 'Connected' : 'Disconnected'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={workspace.demo ? 'Leave preview' : connected ? 'Disconnect' : 'Reconnect'}
            accessibilityState={{ disabled: busy, busy }} disabled={busy} style={s.connectionAction}
            onPress={() => { if (connected) void run(async () => workspace.actions.disconnect());
              else if (workspace.actions.reconnect) void run(workspace.actions.reconnect); else onConnect(); }}>
            <Text style={[s.connectionText, { color: connected ? colors.muted : colors.accent }]}>
              {busy ? 'Please wait…' : workspace.demo ? 'Leave preview' : connected ? 'Disconnect' : 'Reconnect'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[s.section, { color: colors.muted }]}>Trusted devices</Text>
      {!workspace.devices.length ? <Hint>Reconnect to view trusted devices.</Hint> :
        <View style={[s.devices, { borderTopColor: colors.border }]}>{workspace.devices.map(device =>
          <View key={device.id} style={[s.device, { borderBottomColor: colors.border }]}>
            <Icon name="phone-portrait-outline" size={22} color={colors.muted} />
            <View style={s.deviceText}><Text style={[s.deviceName, { color: colors.text }]}>{device.name}</Text>
              {device.current && <Text style={[s.deviceMeta, { color: colors.muted }]}>This device</Text>}</View>
            {workspace.actions.revokeDevice && connected && device.current && <IconButton icon="trash-outline" label={`Remove ${device.name}`}
              disabled={busy} onPress={() => revoke(device.id, device.name)} />}
          </View>)}</View>}
      {!workspace.demo && <Pressable accessibilityRole="button" accessibilityLabel="Pair another computer" onPress={onConnect} style={s.add}>
        <Icon name="add" size={21} color={colors.accent} /><Text style={[s.addText, { color: colors.accent }]}>Pair another computer</Text>
      </Pressable>}
      <Text style={[s.note, { color: colors.muted }]}>Keep your computer awake to continue working remotely.</Text>
    </>}
    {(error || workspace.error) && <View style={s.error}><Hint error>{error || workspace.error}</Hint></View>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 36 }, title: { fontSize: 29, fontWeight: '600', letterSpacing: -0.9 },
  section: { fontSize: 13, fontWeight: '500', marginTop: 31, marginBottom: 13 },
  host: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 17 },
  hostHeading: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 19 },
  hostIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hostText: { flex: 1, gap: 6 }, name: { fontSize: 17, fontWeight: '500', lineHeight: 23 }, platform: { fontSize: 12, lineHeight: 18 },
  hostFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  state: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }, dot: { width: 6, height: 6, borderRadius: 3 }, stateText: { fontSize: 12 },
  connectionAction: { minHeight: 47, justifyContent: 'center', paddingLeft: 10 }, connectionText: { fontSize: 13, fontWeight: '500' },
  devices: { borderTopWidth: StyleSheet.hairlineWidth }, device: { minHeight: 73, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  deviceText: { flex: 1, gap: 5 }, deviceName: { fontSize: 15, lineHeight: 21 }, deviceMeta: { fontSize: 12 },
  add: { minHeight: 52, marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }, addText: { fontSize: 15, fontWeight: '500' },
  note: { fontSize: 12, lineHeight: 19, marginTop: 18 }, error: { paddingTop: 18 },
});
