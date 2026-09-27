import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useReducedMotion } from '../ui/useReducedMotion';
import { ComposerSurface } from '../vibes/ComposerSurface';
import { useGlass } from '../vibes/glass';
import { rulePrefix } from './permissionRule';
import type { ConversationDecision, ConversationPermission, ConversationViewProps, RequestBlock } from './types';

/** A pending decision rises from the composer and uses the same material. */
export function ConversationApprovalDock({ item, canRespond, blocked, onDecision }: {
  item: ConversationPermission;
  canRespond: boolean;
  blocked?: RequestBlock;
  onDecision: ConversationViewProps['onDecision'];
}) {
  const { colors } = useTheme();
  const glass = useGlass();
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
  const command = (detail.match(/^Environment: [^\n]+\n([\s\S]*)$/)?.[1] ?? detail).trim();
  const prefix = rulePrefix(item.ruleSummary);
  const options: { label: string; decision: ConversationDecision; prefix?: string }[] = [
    { label: item.allowLabel ?? 'Allow once', decision: 'accept' },
    ...(item.choices?.includes('acceptWithExecpolicyAmendment') && item.ruleSummary
      ? [{ label: 'Always allow matching commands', decision: 'acceptWithExecpolicyAmendment' as const,
        prefix: prefix ?? item.ruleSummary }] : []),
    ...(item.choices?.includes('acceptForSession')
      ? [{ label: 'Allow for this session', decision: 'acceptForSession' as const }] : []),
    { label: 'Decline', decision: 'decline' },
  ];
  const disabled = !canRespond || sent !== null || item.status !== 'pending';
  return <Animated.View style={[s.wrap, { opacity, transform: [{ translateY: rise }] }]}>
    <ComposerSurface testID="approval-dock" style={s.surface}>
      <ScrollView style={s.commandScroll} contentContainerStyle={s.commandBox} keyboardShouldPersistTaps="always">
        <Text selectable style={[s.command, { color: colors.text }]}>
          {command ? `$ ${command}` : item.reason ?? item.title}
        </Text>
      </ScrollView>
      <View style={[s.divider, { backgroundColor: glass.rim }]} />
      {error && <Text accessibilityRole="alert" style={[s.message, { color: colors.error }]}>{error}</Text>}
      {!canRespond && <View style={s.blocked}>
        <Text style={[s.message, { color: colors.muted }]}>{blocked?.reason ?? 'Take control to answer.'}</Text>
        {blocked?.action && <Pressable accessibilityRole="button" onPress={blocked.action.onPress} style={s.fix}>
          <Text style={[s.fixText, { color: colors.accent }]}>{blocked.action.label}</Text>
        </Pressable>}
      </View>}
      <View style={s.options}>
        {options.map((option, index) => <Pressable key={option.decision} accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityHint={option.prefix ? `Future commands starting with ${option.prefix} can run without asking.` : undefined}
          disabled={disabled} onPress={() => void choose(option.decision)}
          style={({ pressed }) => [s.option, {
            backgroundColor: pressed ? glass.well : index === 0 ? colors.accentSoft : 'transparent',
            opacity: disabled && !sent ? 0.5 : 1,
          }]}>
          <Text style={[s.number, { color: index === 0 ? colors.accent : colors.muted }]}>{index + 1}</Text>
          <View style={s.optionCopy}>
            <Text style={[s.optionText, { color: index === 0 ? colors.accent : colors.text }]}>{option.label}</Text>
            {option.prefix && <Text selectable style={[s.prefix, { color: colors.muted }]}>{option.prefix}</Text>}
          </View>
          {sent === option.decision && <Text style={[s.message, { color: colors.muted }]}>Sending…</Text>}
        </Pressable>)}
      </View>
    </ComposerSurface>
  </Animated.View>;
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 624, alignSelf: 'center', paddingHorizontal: 12, marginBottom: 2 },
  surface: { borderRadius: 28, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 9 },
  commandScroll: { maxHeight: 92, flexGrow: 0 },
  commandBox: { paddingHorizontal: 11, paddingVertical: 8 },
  command: { fontFamily: 'Menlo', fontSize: 12.5, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginVertical: 5 },
  options: { gap: 2 },
  option: { minHeight: 46, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 11 },
  number: { fontFamily: 'Menlo', fontSize: 12, width: 14 },
  optionCopy: { flex: 1, gap: 2 },
  optionText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  prefix: { fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
  message: { fontSize: 12, lineHeight: 17 },
  blocked: { paddingHorizontal: 12, paddingBottom: 4 },
  fix: { minHeight: 36, justifyContent: 'center' },
  fixText: { fontSize: 12, fontWeight: '600' },
});
