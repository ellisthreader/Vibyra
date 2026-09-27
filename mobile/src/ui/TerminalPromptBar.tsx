import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TerminalPrompt } from '../terminal/promptChoices';
import { useTheme } from '../theme';
import { font, radius } from './font';
import { asked } from './haptics';
import { Icon } from './primitives';

/**
 * A CLI in a terminal is waiting on a choice ("Do you want to proceed?"). The
 * choices become buttons, since picking one from the keyboard on a phone
 * means knowing the key. A choice sends exactly the key the CLI reads; the
 * card also shows the command context where the CLI supplies it.
 */
export function TerminalPromptBar({ prompt, blocked, onChoose }: {
  prompt: TerminalPrompt;
  /** Why this phone cannot answer, and the fix when there is one. */
  blocked?: { reason: string; action?: { label: string; onPress(): void } };
  onChoose(keys: string): Promise<void>;
}) {
  const { colors } = useTheme();
  // Once a choice is sent, the others wait for the screen to move on.
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  useEffect(() => { setSent(null); setError(undefined); inFlight.current = false; }, [prompt]);
  useEffect(() => asked(), [prompt.question]);
  const choose = async (keys: string) => {
    if (inFlight.current || sent !== null) return;
    inFlight.current = true;
    setSent(keys);
    setError(undefined);
    try {
      await onChoose(keys);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not confirm delivery.';
      setError(`${message} Check the live terminal before answering again.`);
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <ScrollView accessibilityLiveRegion="polite" style={[s.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      contentContainerStyle={s.content} keyboardShouldPersistTaps="always">
      <View style={s.head}>
        <Icon name="hand-left-outline" size={16} color={colors.accent} />
        <Text accessibilityRole="header" numberOfLines={3} style={[s.question, { color: colors.text }]}>{prompt.question}</Text>
      </View>
      {prompt.context && <Text selectable style={[s.context, { backgroundColor: colors.elevated, color: colors.text }]}>{prompt.context}</Text>}
      {error && <Text accessibilityRole="alert" style={[s.reason, { color: colors.error }]}>{error}</Text>}
      {blocked ? (
        <View style={s.blocked}>
          <Text style={[s.reason, { color: colors.muted }]}>{blocked.reason}</Text>
          {blocked.action && (
            <Pressable accessibilityRole="button" onPress={blocked.action.onPress} style={s.fix}>
              <Text style={[s.fixText, { color: colors.accent }]}>{blocked.action.label}</Text>
              <Icon name="arrow-forward" size={14} color={colors.accent} />
            </Pressable>
          )}
        </View>
      ) : (
        prompt.options.map((option, index) => (
          <Pressable key={`${index}:${option.label}`} accessibilityRole="button" accessibilityLabel={option.label}
            disabled={sent !== null} onPress={() => void choose(option.keys)}
            style={({ pressed }) => [s.option, { backgroundColor: pressed ? colors.accentSoft : colors.elevated, opacity: sent !== null && sent !== option.keys ? 0.45 : 1 }]}>
            <Text numberOfLines={2} style={[s.label, { color: colors.text }]}>{option.label}</Text>
            {sent === option.keys && <Text style={[s.sending, { color: colors.muted }]}>{error ? 'Check terminal' : 'Sent'}</Text>}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bar: { marginHorizontal: 12, marginTop: 8, maxHeight: 360, flexGrow: 0, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  content: { padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  question: { ...font.row, flex: 1 },
  context: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 17, padding: 10, borderRadius: radius.md, overflow: 'hidden' },
  option: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...font.subhead, flex: 1 },
  sending: { ...font.caption },
  blocked: { gap: 2, paddingHorizontal: 2 },
  reason: { ...font.footnote },
  fix: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  fixText: { ...font.subhead, fontWeight: '600' },
});
