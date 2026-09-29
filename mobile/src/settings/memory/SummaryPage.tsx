import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { PROFILE_MAX } from '../../vibes/preferencesApi';
import { PageState } from '../pages/PageState';
import type { SettingsPageProps } from '../pages';
import { Footnote } from '../SettingsRows';
import { usePersonalization } from '../usePersonalization';
import { sampleNote } from '../whose';
import { useTextDraft } from './useTextDraft';

/**
 * The memory summary, written like a note: one box as tall as the sheet, so a few
 * pages of it can be read and edited without a card in the way. Like every text in
 * Settings it saves when it is left — Done, Back, or closing the sheet — and says
 * "Saved" only once the server has it. The sheet lifts the page over the keyboard,
 * and the box scrolls itself to follow the caret.
 */
export function SummaryPage({ workspace, nav }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const { store, state } = usePersonalization(workspace);
  const draft = useTextDraft(store, state, 'summary');
  const input = useRef<TextInput>(null);
  if (!store || state.status !== 'ready' || !state.preferences) {
    return (
      <PageState
        feature="Memory"
        state={state}
        onRetry={() => void store?.load()}
        onSignIn={() => nav.signIn()}
      />
    );
  }
  const { memoryEnabled, summaryEnabled } = state.preferences;
  return (
    <View style={[s.page, { paddingBottom: Math.max(bottom, 12) + 8 }]}>
      <View
        style={[
          s.card,
          {
            backgroundColor: colors.surface,
            borderColor: draft.focused ? colors.accent : colors.border,
          },
        ]}
      >
        <TextInput
          ref={input}
          value={draft.value}
          multiline
          maxLength={PROFILE_MAX.summary}
          textAlignVertical="top"
          accessibilityLabel="Memory summary"
          autoFocus={!draft.value}
          placeholderTextColor={colors.muted}
          placeholder={
            'Everything Vibyra should know about you, in your own words: who you are, what you’re working on, ' +
            'the tools you use, how you like to learn, and the people and dates worth remembering.'
          }
          onChangeText={draft.change}
          onFocus={draft.focus}
          onBlur={() => void draft.commit()}
          style={[s.input, { color: colors.text }]}
        />
        <View style={s.foot}>
          <Text style={[s.count, { color: colors.muted }]}>
            {draft.value.length.toLocaleString('en-GB')} /{' '}
            {PROFILE_MAX.summary.toLocaleString('en-GB')}
          </Text>
          <View style={s.status}>
            {draft.saving ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : draft.saved ? (
              <Text accessibilityLiveRegion="polite" style={[s.saved, { color: colors.muted }]}>
                Saved
              </Text>
            ) : null}
            {draft.focused && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                hitSlop={8}
                onPress={() => input.current?.blur()}
              >
                <Text style={[s.done, { color: colors.accent }]}>Done</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
      {state.error && (
        <View style={s.error}>
          <Hint error>{state.error}</Hint>
        </View>
      )}
      {!draft.focused && (
        <Footnote>
          {!memoryEnabled
            ? 'Memory is off, so Vibyra isn’t reading this. Turn it on in Memory.'
            : !summaryEnabled
              ? 'This summary is switched off, so Vibyra isn’t reading it. Switch it on in Memory.'
              : workspace.demo
                ? sampleNote(workspace)
                : 'Vibyra reads this in every phone chat.'}
        </Footnote>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  card: {
    flex: 1,
    minHeight: 180,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  input: { flex: 1, fontSize: 16, lineHeight: 23, padding: 0, outlineWidth: 0 } as object,
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 26,
    marginTop: 6,
  },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  saved: { fontSize: 13 },
  done: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 10, marginHorizontal: 16 },
});
