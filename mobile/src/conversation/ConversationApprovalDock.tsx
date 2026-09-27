import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { palettes, useTheme } from '../theme';
import { useReducedMotion } from '../ui/useReducedMotion';
import { Icon } from '../ui/primitives';
import { rulePrefix } from './permissionRule';
import type { ConversationDecision, ConversationPermission, ConversationViewProps, RequestBlock } from './types';

const ink = palettes.dark;

/** The live CLI decision sits immediately above the phone's message box. */
export function ConversationApprovalDock({ item, canRespond, blocked, onDecision }: {
  item: ConversationPermission;
  canRespond: boolean;
  blocked?: RequestBlock;
  onDecision: ConversationViewProps['onDecision'];
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const inFlight = useRef(false);
  const [sent, setSent] = useState<ConversationDecision | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (reduced) { rise.setValue(0); opacity.setValue(1); return; }
    const motion = Animated.parallel([
      Animated.timing(rise, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]);
    motion.start();
    return () => motion.stop();
  }, [opacity, reduced, rise]);
  const choose = async (decision: ConversationDecision) => {
    if (!canRespond || sent || inFlight.current || item.status !== 'pending') return;
    inFlight.current = true;
    setSent(decision);
    setError(undefined);
    try { await onDecision(item.id, decision); }
    catch (cause) {
      setSent(null);
      setError(cause instanceof Error ? cause.message : 'Could not send your choice.');
    } finally { inFlight.current = false; }
  };
  const detail = item.detail ?? '';
  const match = detail.match(/^Environment: ([^\n]+)\n([\s\S]*)$/);
  const environment = match?.[1] ?? 'local';
  const command = match?.[2] ?? detail;
  const prefix = rulePrefix(item.ruleSummary);
  const options: { label: string; decision: ConversationDecision }[] = [
    { label: item.allowLabel ?? 'Allow once', decision: 'accept' },
    ...(item.choices?.includes('acceptWithExecpolicyAmendment') && item.ruleSummary
      ? [{ label: 'Allow and remember', decision: 'acceptWithExecpolicyAmendment' as const }] : []),
    ...(item.choices?.includes('acceptForSession')
      ? [{ label: 'Allow for this session', decision: 'acceptForSession' as const }] : []),
    { label: 'Decline', decision: 'decline' },
  ];
  const disabled = !canRespond || sent !== null || item.status !== 'pending';
  return <Animated.View style={[s.shell, { borderColor: ink.border, backgroundColor: ink.surface,
    opacity, transform: [{ translateY: rise }] }]}>
    <View style={s.head}>
      <Icon name="terminal-outline" size={17} color={colors.accent} />
      <Text accessibilityRole="header" style={s.heading}>Codex needs approval</Text>
      <Text style={s.environment}>{environment}</Text>
    </View>
    <ScrollView style={s.context} contentContainerStyle={s.contextInner} keyboardShouldPersistTaps="always">
      {item.reason && <Text style={s.reason}>{item.reason}</Text>}
      {command ? <Text selectable style={s.command}>$ {command}</Text> : null}
      <Text selectable style={s.scope}>{item.scope ?? 'This action only'}</Text>
    </ScrollView>
    {item.choices?.includes('acceptWithExecpolicyAmendment') && item.ruleSummary &&
      <View style={s.ruleBlock}>
        <Text style={s.ruleCaption}>Remembering skips future approval for this prefix:</Text>
        <ScrollView style={s.ruleScroll} keyboardShouldPersistTaps="always">
          <Text selectable style={s.rule}>{prefix ?? item.ruleSummary}</Text>
        </ScrollView>
      </View>}
    {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!canRespond && <View style={s.blocked}>
      <Text style={s.scope}>{blocked?.reason ?? 'Take control to answer.'}</Text>
      {blocked?.action && <Pressable accessibilityRole="button" onPress={blocked.action.onPress} style={s.fix}>
        <Text style={[s.fixText, { color: colors.accent }]}>{blocked.action.label}</Text>
      </Pressable>}
    </View>}
    <View style={s.options}>
      {options.map((option, index) => <Pressable key={option.decision} accessibilityRole="button"
        accessibilityLabel={option.label} disabled={disabled}
        onPress={() => void choose(option.decision)}
        style={({ pressed }) => [s.option, { backgroundColor: index === 0 ? colors.action : pressed ? ink.elevated : 'transparent',
          opacity: disabled && !sent ? 0.5 : 1 }]}>
        <Text style={[s.number, { color: index === 0 ? colors.onAction : ink.muted }]}>{index === 0 ? '›' : ' '} {index + 1}.</Text>
        <Text style={[s.optionText, { color: index === 0 ? colors.onAction : ink.text }]}>{option.label}</Text>
        {sent === option.decision && <Text style={s.sent}>Sending…</Text>}
      </Pressable>)}
    </View>
  </Animated.View>;
}

const s = StyleSheet.create({
  shell: { marginHorizontal: 12, marginBottom: 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18,
    padding: 12, gap: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { color: ink.text, fontSize: 14, fontWeight: '700', flex: 1 },
  environment: { color: ink.muted, fontFamily: 'Menlo', fontSize: 11 },
  context: { maxHeight: 150, flexGrow: 0 },
  contextInner: { gap: 7 },
  reason: { color: ink.text, fontSize: 14, lineHeight: 19 },
  command: { color: ink.text, backgroundColor: ink.elevated, fontFamily: 'Menlo', fontSize: 11.5,
    lineHeight: 17, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, overflow: 'hidden' },
  scope: { color: ink.muted, fontSize: 11, lineHeight: 16 },
  ruleBlock: { gap: 3 },
  ruleCaption: { color: ink.muted, fontSize: 11, lineHeight: 16 },
  ruleScroll: { maxHeight: 44, flexGrow: 0 },
  rule: { color: ink.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
  error: { color: ink.error, fontSize: 12, lineHeight: 17 },
  blocked: { gap: 2 },
  fix: { minHeight: 36, justifyContent: 'center' },
  fixText: { fontSize: 12, fontWeight: '600' },
  options: { gap: 2 },
  option: { minHeight: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 7 },
  number: { fontFamily: 'Menlo', fontSize: 12, width: 36 },
  optionText: { fontSize: 14, fontWeight: '600', flex: 1 },
  sent: { color: ink.muted, fontSize: 11 },
});
