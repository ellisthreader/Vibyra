import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import { rulePrefix } from './permissionRule';
import { RequestFrame } from './RequestFrame';
import type { ConversationDecision, ConversationPermission, ConversationViewProps, RequestBlock } from './types';

export function PermissionCard({
  item,
  canRespond,
  blocked,
  onDecision,
  onInspect,
  onReveal,
}: {
  onInspect?: (item: import('../state/conversationTypes').AgentItem) => void;
  onReveal?: () => void;
  item: ConversationPermission;
  canRespond: boolean;
  blocked?: RequestBlock;
  onDecision: ConversationViewProps['onDecision'];
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const respond = async (decision: ConversationDecision) => {
    if (inFlight.current || !canRespond || item.status !== 'pending') return;
    inFlight.current = true;
    setSending(true);
    setError(undefined);
    try {
      await onDecision(item.id, decision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your response.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  const disabled = !canRespond || sending || item.status !== 'pending';
  const long = (item.detail?.split('\n').length ?? 0) > 6 || (item.detail?.length ?? 0) > 420;
  const prefix = rulePrefix(item.ruleSummary);
  return (
    <RequestFrame
      title={item.title}
      icon="hand-left-outline"
      status={sending ? 'resolving' : item.status}
      canRespond={canRespond}
      blocked={blocked}
      error={error}
    >
      {item.reason && <Text style={[s.body, { color: colors.text }]}>{item.reason}</Text>}
      {/* What is being allowed is shown, not hidden behind a disclosure; only a long one folds. */}
      {item.detail ? (
        <Pressable disabled={!long} onPress={() => setExpanded(!expanded)}
          accessibilityRole={long ? 'button' : undefined} accessibilityState={long ? { expanded } : undefined}>
          <Text selectable numberOfLines={long && !expanded ? 6 : undefined}
            style={[s.detail, { backgroundColor: colors.elevated, color: colors.text }]}>
            {item.detail}
          </Text>
          {long && (
            <Text style={[s.detailsLabel, { color: colors.muted }]}>{expanded ? 'Show less' : 'Show all'}</Text>
          )}
        </Pressable>
      ) : null}
      <Text selectable style={[s.scope, { color: colors.muted }]}>{item.scope ?? 'This action only'}</Text>
      {item.source?.hasDetail && onInspect && (
        <Pressable
          accessibilityRole="button"
          style={s.detailsButton}
          onPress={() => onInspect(item.source!)}
        >
          <Text style={{ color: colors.accent }}>Review complete action</Text>
        </Pressable>
      )}
      {item.status === 'pending' && (
        <View style={s.actions}>
          <View style={s.action}>
            <Button
              title="Decline"
              secondary
              disabled={disabled}
              onPress={() => void respond('decline')}
            />
          </View>
          <View style={s.action}>
            <Button
              title={item.allowLabel ?? 'Allow once'}
              disabled={disabled}
              onPress={() => void respond('accept')}
            />
          </View>
          {item.choices?.includes('acceptForSession') && (
            <View style={s.action}>
              <Button
                title="Allow for this session"
                secondary
                disabled={disabled}
                onPress={() => void respond('acceptForSession')}
              />
            </View>
          )}
        </View>
      )}
      {item.choices?.includes('acceptWithExecpolicyAmendment') && item.ruleSummary && <>
        <Pressable accessibilityRole="button" accessibilityLabel="Review always-allow Codex rule"
          accessibilityState={{ expanded: ruleOpen }} onPress={() => {
            setRuleOpen(!ruleOpen);
            if (!ruleOpen && item.status === 'pending') onReveal?.();
          }}
          style={s.ruleToggle}>
          <Icon name="bookmark-outline" size={17} color={colors.muted} />
          <Text style={[s.ruleToggleText, { color: colors.text }]}>Always allow matching commands</Text>
          <Icon name={ruleOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </Pressable>
        {ruleOpen && <View style={s.ruleContent}>
          {prefix ? <>
            <Text style={[s.rule, { color: colors.muted }]}>Future commands starting with these exact tokens can run without asking:</Text>
            <Text selectable style={[s.rulePrefix, { color: colors.text, backgroundColor: colors.elevated }]}>{prefix}</Text>
          </> : <Text selectable style={[s.rule, { color: colors.muted }]}>{item.ruleSummary}</Text>}
          {item.status === 'pending' && <Button title="Allow and remember Codex rule" secondary
            disabled={disabled} onPress={() => void respond('acceptWithExecpolicyAmendment')} />}
        </View>}
      </>}
    </RequestFrame>
  );
}
const s = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, letterSpacing: -0.2 },
  scope: { fontSize: 12, lineHeight: 16 },
  detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailsLabel: { fontSize: 13, fontWeight: '500', paddingTop: 6 },
  detail: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 18, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  action: { flex: 1, minWidth: 120 },
  ruleToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleToggleText: { fontSize: 14, fontWeight: '500', flex: 1 },
  ruleContent: { gap: 10, paddingBottom: 2 },
  rule: { fontSize: 12, lineHeight: 18 },
  rulePrefix: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 18, padding: 10, borderRadius: 9, overflow: 'hidden' },
});
