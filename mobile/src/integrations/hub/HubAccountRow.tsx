import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';
import type { HubConnection } from '../../agents/v2/connectionsModel';
import { STATUS_PILL, accountTitle, lastUsedLine, teammatesLine } from '../../agents/v2/hubModel';
import { StatusPill } from './StatusPill';
import { HubAction } from './HubAction';

/**
 * One connected account: who it is, its status, which teammates use it and when it was
 * last used. Disconnect asks in place — the confirm is part of the row, never a system alert.
 */
export function HubAccountRow({ connection, first, busy, onReconnect, onDisconnect, children }: {
  connection: HubConnection; first: boolean; busy: string | null;
  onReconnect(): void; onDisconnect(): void; children?: ReactNode;
}) {
  const { colors } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const pill = STATUS_PILL[connection.status];
  const title = accountTitle(connection);
  const canReconnect = connection.reconnect !== null;
  const shared = connection.source === 'install';
  return (
    <View style={[s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={s.head}>
        <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{title}</Text>
        <StatusPill label={pill.label} tone={pill.tone} />
      </View>
      <Text style={[s.detail, { color: colors.muted }]}>
        {teammatesLine(connection)} · {lastUsedLine(connection.lastUsedAt)}
      </Text>
      {children}
      {confirm ? (
        <View style={[s.confirm, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
          <Text style={[s.detail, { color: colors.text }]}>
            Disconnect {title}? {connection.teammates.length ? 'Every teammate loses access to it. ' : ''}
            {shared ? 'Chats lose it too.' : ''}
          </Text>
          <View style={s.actions}>
            <HubAction title="Keep" onPress={() => setConfirm(false)} />
            <HubAction tone="danger" title="Disconnect" label={`Confirm disconnect ${title}`} busy={busy === `remove:${connection.id}`}
              disabled={busy !== null} onPress={() => { setConfirm(false); onDisconnect(); }} />
          </View>
        </View>
      ) : (
        <View style={s.actions}>
          {canReconnect && (
            <HubAction tone="primary" title="Reconnect" label={`Reconnect ${title}`} busy={busy === `reconnect:${connection.id}`}
              disabled={busy !== null} onPress={onReconnect} />
          )}
          <HubAction title="Disconnect" label={`Disconnect ${title}`} disabled={busy !== null} onPress={() => setConfirm(true)} />
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  title: { ...font.row, flex: 1, minWidth: 0 },
  detail: { ...font.footnote },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  confirm: { borderRadius: 12, padding: 12, gap: 6, marginTop: 4 },
});
