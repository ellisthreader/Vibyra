import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { ActionDetails } from './ActionDetails';
import { approvalAccount } from './v2/approvalAccount';
import { providerName, toolWords } from './v2/providerLabels';
import type { AccountCounts } from './useGrantedAccounts';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { font } from '../ui/font';
import type { VibesTool, VibesTurn } from '../vibes/types';
import type { VibesStore } from '../vibes/VibesStore';
import type { AgentsApi } from './types';

export function decisionAvailable(tool: VibesTool, turn: VibesTurn, now = Date.now()) {
  return (
    turn.status === 'waiting' &&
    tool.approval?.state === 'pending' &&
    !tool.approval.answer &&
    tool.expiresAt * 1000 > now
  );
}
const states: Record<string, string> = {
  queued: 'Approved · waiting to run',
  dispatching: 'Action in progress',
  publishing: 'Publishing GitHub branch',
  completed: 'Action completed',
  declined: 'Declined',
  expired: 'Approval expired',
  refused: 'Not run · its access or connection changed before it could start',
  failed: 'Action failed',
  cancelled: 'Cancelled with the task',
  unknown: 'Outcome unconfirmed. Check the connected service before repeating this action.',
};
export function AgentDecision({
  tool,
  turn,
  api,
  store,
  enabled,
  accounts,
}: {
  tool: VibesTool;
  turn: VibesTurn;
  api: AgentsApi;
  store: VibesStore;
  enabled: boolean;
  /** v2: how many accounts of this provider the teammate may use, so two accounts never look alike. */
  accounts?: AccountCounts;
}) {
  const { colors } = useTheme();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const approval = tool.approval!;
  useEffect(() => {
    if (tool.v2 && approval.state === 'pending') accounts?.refresh();
  }, [accounts, tool.v2, approval.state]);
  const account = tool.v2 ? approvalAccount(tool.account, tool.connectionId, accounts?.count(tool.integration ?? '') ?? 1) : null;
  const resolve = async (answer: 'allow' | 'decline') => {
    if (
      lock.current ||
      !enabled ||
      !store.state.ready ||
      AppState.currentState !== 'active' ||
      !decisionAvailable(tool, turn)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const fresh = await store.api.turn(turn.id);
      const action = fresh.tools?.find((item) => item.id === tool.id);
      if (
        !action ||
        !decisionAvailable(action, fresh) ||
        action.approval?.fingerprint !== approval.fingerprint
      )
        throw new Error('This action changed or expired. Refresh before deciding.');
      await api.decide(tool.id, approval.fingerprint, answer);
      setUnconfirmed(true);
      await store.refresh();
    } catch (e) {
      setUnconfirmed(true);
      setError(e instanceof Error ? e.message : 'The decision could not be confirmed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    await store.refresh();
    if (store.state.ready) {
      setUnconfirmed(false);
      setError(null);
    }
    setBusy(false);
  };
  const pending = approval.state === 'pending';
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.head}>
        <View
          style={[s.badge, { backgroundColor: pending ? colors.warning + '24' : colors.elevated }]}
        >
          <Icon
            name={pending ? 'hand-left-outline' : 'checkmark-done-outline'}
            size={16}
            color={pending ? colors.warning : colors.muted}
          />
        </View>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
          {tool.v2 ? `${toolWords(tool.operation, tool.integration)} · ${providerName(tool.integration, 'Connected service')}` : `${tool.operation.replaceAll('_', ' ')} · ${tool.integration ?? 'Agent Computer'}`}
        </Text>
      </View>
      {account ? <Text selectable style={{ color: colors.muted, fontSize: 13, marginTop: -4 }}>{`Using ${account}`}</Text> : null}
      <View style={[s.details, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <ActionDetails args={approval.arguments} />
      </View>
      {tool.operation === 'run_test' && <Hint>The selected file bytes run in a disconnected Linux VM. The teammate receives the test output.</Hint>}
      {tool.operation === 'publish_branch' && <Hint>Review the repository, base commit, branch, message and every changed file. Approval publishes this exact snapshot to GitHub once.</Hint>}
      {pending ? (
        <>
          <Hint>
            {decisionAvailable(tool, turn)
              ? 'Review this exact action before it runs.'
              : 'This approval is no longer active.'}
          </Hint>
          <View style={s.actions}>
            <View style={s.button}>
              <Button
                secondary
                title="Deny"
                disabled={
                  busy ||
                  unconfirmed ||
                  !enabled ||
                  !store.state.ready ||
                  !decisionAvailable(tool, turn)
                }
                onPress={() => void resolve('decline')}
              />
            </View>
            <View style={s.button}>
              <Button
                title="Approve once"
                busy={busy}
                disabled={
                  unconfirmed || !enabled || !store.state.ready || !decisionAvailable(tool, turn)
                }
                onPress={() => void resolve('allow')}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <Hint>
            {approval.state === 'unknown' && tool.operation === 'run_test'
              ? 'Test result unconfirmed. Check this task before trying again.'
              : approval.state === 'unknown' && tool.operation === 'publish_branch'
              ? 'GitHub branch outcome unconfirmed. Inspect the repository before trying again.'
              : approval.state === 'unknown' && !tool.integration
              ? 'Outcome unconfirmed. Check the file on your computer before trying again.'
              : approval.state === 'queued' && !approval.answer
                ? 'Waiting to run'
                : (states[approval.state] ?? 'Checking action status…')}
          </Hint>
          {tool.summary && <Hint>{tool.summary}</Hint>}
        </>
      )}
      {error && <Hint error>{error}</Hint>}
      {unconfirmed && pending && (
        <Button secondary title="Refresh decision" busy={busy} onPress={() => void refresh()} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.row, fontWeight: '600', flex: 1, textTransform: 'capitalize' },
  details: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { flexGrow: 1, flexBasis: 125 },
});
