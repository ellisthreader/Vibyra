import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row } from '../SettingsRows';
import { useRemoteSecurity, liveRemoteSession } from '../useRemoteSecurity';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { confirmAction } from '../../ui/confirm';
import { Hint } from '../../ui/primitives';
import { useTheme } from '../../theme';
const activityTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : undefined;
};

export function RemoteSecurityPage({ workspace }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const { colors } = useTheme();
  const { api, data, error, busy, reload, act } = useRemoteSecurity(workspace);
  const sessions = data?.sessions.filter(liveRemoteSession) ?? [];
  if (!api || !workspace.account) return <Footnote>Sign in to manage remote access.</Footnote>;
  const confirm = (name: string, title: string, detail: string, button: string, work: () => Promise<void>) =>
    confirmAction(title, detail, button, () => void act(name, work));
  const action = (label: string, run: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label}
    disabled={!!busy} onPress={run} hitSlop={8} style={{ padding: 8, opacity: busy ? 0.5 : 1 }}>
    <Text style={{ color: colors.accent, fontWeight: '600' }}>{label}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottom + 24 }}>
    {error && <View style={{ marginVertical: 12 }}><Hint error>{error}</Hint></View>}
    {!data ? <Group><Row title={error ? 'Try again' : 'Loading remote access…'} busy={!error}
      onPress={error ? () => void reload() : undefined} /></Group> : <>
      <Label first>Computers</Label>
      <Group>{data.computers.length ? data.computers.map(computer => <Row key={computer.id}
        title={computer.name} value={computer.online ? 'Online' : 'Offline'} dot={computer.online ? colors.success : undefined} />)
        : <Row title="No computers registered" />}</Group>
      <Footnote>Cloud connections require a trusted device and a passkey. Account-wide security changes also stop nearby access on online computers. Offline computers apply them when they reconnect.</Footnote>
      <Label>Passkeys</Label>
      <Group>{data.passkeys.length ? data.passkeys.map(passkey => <Row key={passkey.id} title={passkey.device_name}
        detail={passkey.last_used_at ? `Last used ${activityTime(passkey.last_used_at) ?? ''}` : 'Ready to verify remote access'}
        right={action('Remove', () => confirm(`passkey-${passkey.id}`, `Remove ${passkey.device_name}?`,
          'This passkey is removed and remote sessions end. Offline computers apply the change when they reconnect. You can add another from an approved device.', 'Remove', () => api.removePasskey(passkey.id)))} />)
        : <Row title="No passkeys added" detail="Add a passkey when connecting from an approved device." />}</Group>
      <Label>Trusted devices</Label>
      <Group>{data.devices.length ? data.devices.map(device => <Row key={device.id} title={device.deviceName}
        detail={device.revokedAt ? 'Revoked' : device.deniedAt ? 'Denied' : device.approvedAt ? 'Trusted' : 'Awaiting desktop approval'}
        right={!device.revokedAt && action('Revoke', () => confirm(device.id, `Revoke ${device.deviceName}?`,
          'Connections from this device end and it will need approval again. Offline computers apply the change when they reconnect.', 'Revoke', () => api.revoke(device.id)))} />)
        : <Row title="No trusted devices" />}</Group>
      <Label>Active sessions</Label>
      <Group>{sessions.length ? sessions.map(session => <Row key={session.id} title={session.clientName}
        detail={`${data.computers.find(computer => computer.id === session.hostId)?.name ?? 'Computer'} · ${session.status.toLowerCase().replaceAll('_', ' ')}`}
        right={action('Disconnect', () => void act(session.id, () => api.disconnect(session.id)))} />)
        : <Row title="No active sessions" />}</Group>
      <Label>Recent activity</Label>
      <Group>{data.events.length ? data.events.slice(0, 30).map(event => <Row key={event.id} title={event.title}
        detail={activityTime(event.createdAt)} value={event.read ? undefined : 'New'}
        onPress={() => void act(event.id, () => api.readEvent(event.id))} trailing="none" />)
        : <Row title="No security activity yet" />}</Group>
      <Label>Emergency controls</Label>
      <Group>
        <Row title="Disconnect all cloud sessions" disabled={!!busy || !sessions.length} trailing="none"
          onPress={() => confirm('disconnect-all', 'Disconnect all cloud sessions?', 'Cloud sessions end. Work running on the computers remains open.', 'Disconnect',
            () => api.disconnectAll(sessions.map(session => session.id)))} />
        <Row title="Revoke all remote devices" disabled={!!busy} trailing="none"
          onPress={() => confirm('revoke-all', 'Revoke all remote devices?', 'Every remote device will need desktop approval again. Offline computers apply the change when they reconnect.', 'Revoke all', api.revokeAll)} />
        <Row title="Disable all remote access" danger busy={busy === 'disable'} disabled={!!busy} trailing="none"
          onPress={() => confirm('disable', 'Disable all remote access?', 'Sessions and pending requests are revoked. Offline computers apply the change when they reconnect. Enable remote access again directly on your computers.', 'Disable',
            api.disable)} />
      </Group>
    </>}
  </ScrollView>;
}
