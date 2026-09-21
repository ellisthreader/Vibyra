import { useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { ActionDetails } from './ActionDetails';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import type { VibesTool, VibesTurn } from '../vibes/types';
import type { VibesStore } from '../vibes/VibesStore';
import type { AgentsApi } from './types';

export function decisionAvailable(tool: VibesTool, turn: VibesTurn, now = Date.now()) {
  return turn.status === 'waiting' && tool.approval?.state === 'pending' && !tool.approval.answer && tool.expiresAt * 1000 > now;
}
const states: Record<string, string> = { queued: 'Approved · waiting to run', dispatching: 'Action in progress', completed: 'Action completed',
  declined: 'Declined', expired: 'Approval expired', unknown: 'Outcome unconfirmed. Check the connected service before repeating this action.' };
export function AgentDecision({ tool, turn, api, store, enabled }: {
  tool: VibesTool; turn: VibesTurn; api: AgentsApi; store: VibesStore; enabled: boolean;
}) {
  const { colors } = useTheme(); const lock = useRef(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [unconfirmed, setUnconfirmed] = useState(false);
  const approval = tool.approval!;
  const resolve = async (answer: 'allow' | 'decline') => {
    if (lock.current || !enabled || !store.state.ready || AppState.currentState !== 'active' || !decisionAvailable(tool, turn)) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const fresh = await store.api.turn(turn.id); const action = fresh.tools?.find(item => item.id === tool.id);
      if (!action || !decisionAvailable(action, fresh) || action.approval?.fingerprint !== approval.fingerprint)
        throw new Error('This action changed or expired. Refresh before deciding.');
      await api.decide(tool.id, approval.fingerprint, answer);
      setUnconfirmed(true);
      await store.refresh();
    } catch (e) { setUnconfirmed(true); setError(e instanceof Error ? e.message : 'The decision could not be confirmed.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); await store.refresh();
    if (store.state.ready) { setUnconfirmed(false); setError(null); } setBusy(false);
  };
  const pending = approval.state === 'pending';
  return <View style={[s.card, { backgroundColor: colors.rail, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{tool.operation.replaceAll('_', ' ')} · {tool.integration}</Text>
    <ActionDetails args={approval.arguments} />
    {pending ? <>
      <Hint>{decisionAvailable(tool, turn) ? 'Review this exact action before it runs.' : 'This approval is no longer active.'}</Hint>
      <View style={s.actions}><View style={s.button}><Button secondary title="Deny" disabled={busy || unconfirmed || !enabled || !store.state.ready || !decisionAvailable(tool, turn)} onPress={() => void resolve('decline')} /></View>
        <View style={s.button}><Button title="Approve once" busy={busy} disabled={unconfirmed || !enabled || !store.state.ready || !decisionAvailable(tool, turn)} onPress={() => void resolve('allow')} /></View></View>
    </> : <><Hint>{approval.state === 'queued' && !approval.answer ? 'Waiting to run' : states[approval.state] ?? 'Checking action status…'}</Hint>
      {tool.summary && <Hint>{tool.summary}</Hint>}</>}
    {error && <Hint error>{error}</Hint>}
    {unconfirmed && pending && <Button secondary title="Refresh decision" busy={busy} onPress={() => void refresh()} />}
  </View>;
}
const s = StyleSheet.create({ card: { padding: 12, borderRadius: 10, gap: 10 }, title: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { flexGrow: 1, flexBasis: 125 } });
