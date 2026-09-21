import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../theme';
import type { TextDraft } from './useTextDraft';

/**
 * One part of "About you": its name and the switch that shares it on one line, and
 * what the person wrote beneath. Switched off, the words stay and dim, because off
 * means "don't send this", not "delete this". `children` replaces the box, for the
 * summary, which is too long to edit in a card and opens a page of its own instead.
 */
export function ProfileField({ title, on, disabled, onSwitch, draft, placeholder, max, multiline, countFrom, onFocus, onLayout, children }: {
  title: string; on: boolean; disabled?: boolean; onSwitch: (on: boolean) => void;
  draft?: TextDraft; placeholder?: string; max?: number; multiline?: boolean;
  /** The count appears only once it is worth reading: near the end, not from the first word. */
  countFrom?: number;
  onFocus?: () => void; onLayout?: (event: LayoutChangeEvent) => void; children?: ReactNode;
}) {
  const { colors } = useTheme();
  const webKnob = { activeThumbColor: colors.onAction } as object;
  const count = draft && max && countFrom !== undefined && draft.value.length >= countFrom;
  const status = draft?.saving ? 'saving' : draft?.saved ? 'saved' : null;
  // With memory off the whole part dims, so a switch that is still on does not read as
  // in use. Off by its own switch, only the words dim: they are kept, just not sent.
  return <View style={[s.item, disabled ? s.dim : null]} onLayout={onLayout}>
    <View style={s.head}>
      <Text style={[s.title, { color: colors.text }]}>{title}</Text>
      {status === 'saving' ? <ActivityIndicator size="small" color={colors.muted} />
        : status === 'saved' ? <Text accessibilityLiveRegion="polite" style={[s.note, { color: colors.muted }]}>Saved</Text> : null}
      <Switch accessibilityLabel={`Use ${title.toLowerCase()}`} value={on} disabled={disabled} onValueChange={onSwitch}
        trackColor={{ true: colors.action, false: colors.border }} thumbColor={on ? colors.onAction : '#FFFFFF'}
        ios_backgroundColor={colors.border} {...webKnob} />
    </View>
    <View style={on ? null : s.dim}>
      {children ?? (draft && <TextInput value={draft.value} accessibilityLabel={title} placeholder={placeholder}
        placeholderTextColor={colors.muted} maxLength={max} multiline={multiline} textAlignVertical="top"
        autoCapitalize={multiline ? 'sentences' : 'words'} returnKeyType={multiline ? 'default' : 'done'}
        submitBehavior={multiline ? 'newline' : 'blurAndSubmit'} onChangeText={draft.change}
        onFocus={() => { draft.focus(); onFocus?.(); }} onBlur={() => void draft.commit()}
        style={[s.input, multiline ? s.multiline : null, { color: colors.text }]} />)}
    </View>
    {count ? <Text style={[s.count, { color: colors.muted }]}>
      {draft.value.length.toLocaleString('en-GB')} / {max.toLocaleString('en-GB')}</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  item: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 2 },
  head: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  note: { fontSize: 13 },
  input: { minHeight: 30, fontSize: 16, lineHeight: 22, letterSpacing: -0.2, padding: 0, outlineWidth: 0 } as object,
  multiline: { minHeight: 72, maxHeight: 176 },
  dim: { opacity: 0.5 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'], textAlign: 'right', marginTop: 4 },
});
