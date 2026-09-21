import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint, Icon } from '../../ui/primitives';
import { INSTRUCTIONS_MAX, personalityStyles, type PersonalityStyle } from '../../vibes/preferencesApi';
import type { SettingsPageProps } from '../pages';
import { styleNames } from '../personalization';
import { Footnote, Group, Label } from '../SettingsRows';
import { usePersonalization } from '../usePersonalization';
import { sampleNote } from '../whose';
import { PageState } from './PageState';

const descriptions: Record<PersonalityStyle, string> = {
  balanced: 'Clear answers with a short why.', concise: 'Just the answer and the code.',
  detailed: 'Step by step, with the trade-offs.', friendly: 'Warm and encouraging, in plain words.',
};
// The count only appears once it is worth reading: near the end, not from the first word.
const COUNT_FROM = 900;

/**
 * How Vibyra replies in phone chats: one of four styles, and the person's own words.
 * A style applies on the tap. The words save when the box is left — Done, a tap
 * elsewhere, or closing the sheet — and "Saved" appears only once the server has them.
 */
export function PersonalityPage({ workspace, nav }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const { store, state } = usePersonalization(workspace);
  // What is being typed, or null while the box shows what the server holds.
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const pending = useRef<string | null>(null); pending.current = draft;
  useEffect(() => {
    if (!state.savedAt) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [state.savedAt]);
  // Closing the sheet mid-sentence is leaving the box too; the words are not dropped.
  useEffect(() => () => { if (pending.current !== null) void store?.saveInstructions(pending.current); }, [store]);
  if (!store || state.status !== 'ready' || !state.preferences) {
    return <PageState feature="Personality" state={state} onRetry={() => void store?.load()} onSignIn={() => nav.signIn()} />;
  }
  const text = draft ?? state.preferences.instructions;
  const commit = async () => {
    setFocused(false);
    if (draft === null) return;
    if (await store.saveInstructions(draft)) setDraft(null);
  };
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
    <Label first>Style</Label>
    <Group>
      {personalityStyles.map(style => {
        const on = state.preferences!.style === style;
        return <Pressable key={style} accessibilityRole="radio" accessibilityLabel={styleNames[style]}
          accessibilityHint={descriptions[style]} aria-checked={on} accessibilityState={{ checked: on }}
          onPress={() => void store.setStyle(style)}
          style={({ pressed }) => [s.option, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
          <View style={s.optionText}>
            <Text style={[s.optionTitle, { color: colors.text }]}>{styleNames[style]}</Text>
            <Text style={[s.optionDetail, { color: colors.muted }]}>{descriptions[style]}</Text>
          </View>
          {on && <Icon name="checkmark" size={20} color={colors.accent} />}
        </Pressable>;
      })}
    </Group>
    <Label>Custom instructions</Label>
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: focused ? colors.accent : colors.border }]}>
      <TextInput ref={input} value={text} multiline maxLength={INSTRUCTIONS_MAX} textAlignVertical="top"
        accessibilityLabel="Custom instructions" placeholderTextColor={colors.muted}
        placeholder="Anything Vibyra should know about how you like answers. For example: I build with Expo and TypeScript; keep diffs small."
        onChangeText={value => { setDraft(value); store.clearError(); }}
        // The box sits below the styles, where a phone keyboard would cover it.
        onFocus={() => { setFocused(true); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 280); }}
        onBlur={() => void commit()} style={[s.input, { color: colors.text }]} />
      {(focused || saved || state.busy === 'instructions' || text.length >= COUNT_FROM) && <View style={s.foot}>
        {text.length >= COUNT_FROM ? <Text style={[s.count, { color: colors.muted }]}>
          {text.length.toLocaleString()} / {INSTRUCTIONS_MAX.toLocaleString()}</Text> : <View />}
        <View style={s.status}>
          {state.busy === 'instructions' ? <ActivityIndicator size="small" color={colors.muted} />
            : saved && !focused ? <Text accessibilityLiveRegion="polite" style={[s.saved, { color: colors.muted }]}>Saved</Text> : null}
          {focused && <Pressable accessibilityRole="button" accessibilityLabel="Done" hitSlop={8} onPress={() => input.current?.blur()}>
            <Text style={[s.done, { color: colors.accent }]}>Done</Text>
          </Pressable>}
        </View>
      </View>}
    </View>
    {state.error && <View style={s.error}><Hint error>{state.error}</Hint></View>}
    <Footnote>Used in chats on this phone. Computer agents like Claude Code and Codex keep their own settings.</Footnote>
    {workspace.demo && <Footnote>{sampleNote(workspace)}</Footnote>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  option: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontSize: 16, letterSpacing: -0.2 },
  optionDetail: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  input: { minHeight: 88, fontSize: 15.5, lineHeight: 22, padding: 0, outlineWidth: 0 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26, marginTop: 6 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  saved: { fontSize: 13 },
  done: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 10, marginHorizontal: 2 },
});
