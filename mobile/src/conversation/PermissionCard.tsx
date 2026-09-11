import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import { RequestFrame } from './RequestFrame';
import type { ConversationPermission, ConversationViewProps } from './types';

export function PermissionCard({ item, canRespond, onDecision }: {
  item: ConversationPermission; canRespond: boolean; onDecision: ConversationViewProps['onDecision'];
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const respond = async (decision: 'accept' | 'decline') => {
    if (inFlight.current || !canRespond || item.status !== 'pending') return;
    inFlight.current = true; setSending(true); setError(undefined);
    try { await onDecision(item.id, decision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send your response.'); }
    finally { inFlight.current = false; setSending(false); }
  };
  const disabled = !canRespond || sending || item.status !== 'pending';
  return <RequestFrame title={item.title} icon="hand-left-outline" status={sending ? 'resolving' : item.status}
    canRespond={canRespond} error={error}>
    {item.reason && <Text style={[s.body, { color: colors.text }]}>{item.reason}</Text>}
    <View style={[s.scope, { backgroundColor: colors.elevated }]}>
      <Text style={[s.scopeLabel, { color: colors.muted }]}>Applies to</Text>
      <Text selectable style={[s.body, { color: colors.text }]}>{item.scope ?? 'This action only'}</Text>
    </View>
    {item.detail && <View><Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button"
      accessibilityState={{ expanded }} style={s.detailsButton}>
      <Text style={[s.detailsLabel, { color: colors.muted }]}>Action details</Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
    </Pressable>{expanded && <Text selectable style={[s.detail, { color: colors.text }]}>{item.detail}</Text>}</View>}
    {item.status === 'pending' && <View style={s.actions}>
      <View style={s.action}><Button title="Decline" secondary disabled={disabled} onPress={() => void respond('decline')} /></View>
      <View style={s.action}><Button title="Allow once" disabled={disabled} onPress={() => void respond('accept')} /></View>
    </View>}
  </RequestFrame>;
}
const s = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 23 }, scope: { padding: 12, borderRadius: 12, gap: 3 },
  scopeLabel: { fontSize: 11, fontWeight: '600' }, detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsLabel: { fontSize: 13 }, detail: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 19, paddingBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flex: 1, minWidth: 120 },
});
