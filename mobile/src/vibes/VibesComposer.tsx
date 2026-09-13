import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { MentionBar } from '../integrations/MentionBar';
import { activeMention, applyMention } from '../integrations/mentions';
import type { Integration } from '../integrations/types';
import { Icon } from '../ui/primitives';
import { vibeWord, vibes } from './count';

export function VibesComposer({ text, onChange, model, modelHint, onModel, effort, onEffort, mentions, trialRemaining, maximum, busy, disabled, onSend, onStop }: {
  text: string; onChange(value: string): void; model: string; onModel(): void;
  // The integrations this account has connected. Typing `@` offers them; an account
  // with none never sees the affordance, because there is nothing to point at.
  mentions?: Integration[];
  // Why Auto chose what it chose. It is spoken rather than drawn: the toolbar has
  // no room for a sentence beside the model name, the effort chip and send.
  modelHint?: string;
  // No effort means this model's thinking cannot be steered, so nothing is shown
  // rather than a control that would send a level the provider rejects. An effort
  // without `onEffort` is Auto's own choice: worth showing, not a control, because
  // the way to change it is to pick a model rather than to tap it.
  effort?: string | null; onEffort?(): void;
  trialRemaining?: number; maximum?: number;
  busy: boolean; disabled: boolean; onSend(): void; onStop(): void;
}) {
  const { colors, dark } = useTheme();
  // The caret is only known once the field reports it, and a plain keystroke does
  // not report one in every runtime, so the end of the text is the fallback. That
  // is the right answer for typing at the end, which is how a mention is written.
  const [caret, setCaret] = useState<number | null>(null);
  // Where the caret is put back to after an insertion, and only then: holding the
  // selection permanently would fight the person as they type.
  const [placed, setPlaced] = useState<number | null>(null);
  const at = caret !== null && caret <= text.length ? caret : text.length;
  const partial = mentions?.length ? activeMention(text, at) : null;
  const suggestions = partial ? mentions!.filter(integration => integration.id.startsWith(partial.query)) : [];
  const choose = (id: string) => {
    if (!partial) return;
    const next = applyMention(text, partial.start, at, id);
    onChange(next.text); setCaret(next.caret); setPlaced(next.caret);
  };
  return <View style={[s.wrap, { backgroundColor: colors.background }]}>
    <MentionBar integrations={suggestions} onChoose={choose} />
    <View style={[s.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput accessibilityLabel="Message Vibyra AI" multiline value={text} maxLength={4000}
        onChangeText={next => { onChange(next); setCaret(null); setPlaced(null); }}
        placeholder="What would you like to build?" placeholderTextColor={colors.muted} keyboardAppearance={dark ? 'dark' : 'light'}
        onSelectionChange={event => { setCaret(event.nativeEvent.selection.end); setPlaced(null); }}
        selection={placed === null ? undefined : { start: placed, end: placed }}
        style={[s.input, { color: colors.text }]} textAlignVertical="top" />
      <View style={s.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={modelHint ? `Choose AI model, currently ${model}. ${modelHint}` : 'Choose AI model'}
          onPress={onModel} style={s.model}>
          <Icon name="sparkles-outline" size={15} color={colors.accent} /><Text numberOfLines={1} style={[s.modelName, { color: colors.text }]}>{model}</Text>
          <Icon name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
        {effort && (onEffort
          ? <Pressable accessibilityRole="button" accessibilityLabel={`Thinking effort, ${effort}`}
            onPress={onEffort} style={[s.effort, { borderColor: colors.border }]}>
            <Icon name="pulse-outline" size={13} color={colors.muted} />
            <Text numberOfLines={1} style={[s.effortName, { color: colors.muted }]}>{effort}</Text>
          </Pressable>
          : <View accessibilityLabel={`Thinking effort, ${effort}, chosen automatically`}
            style={[s.effort, { borderColor: colors.border }]}>
            <Icon name="pulse-outline" size={13} color={colors.muted} />
            <Text numberOfLines={1} style={[s.effortName, { color: colors.muted }]}>{effort}</Text>
          </View>)}
        <View style={s.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Stop AI reply' : 'Send message'} disabled={!busy && disabled}
          accessibilityState={{ disabled: !busy && disabled }} onPress={busy ? onStop : onSend}
          style={[s.send, { backgroundColor: !busy && disabled ? colors.elevated : colors.action }]}>
          <Icon name={busy ? 'stop' : 'arrow-up'} size={22} color={!busy && disabled ? colors.muted : colors.onAction} />
        </Pressable>
      </View>
    </View>
    <View style={s.estimate}>
      <Text style={[s.caption, { color: colors.muted }]}>{busy ? 'Your next draft can wait here.' : maximum !== undefined
        ? 'This reply uses up to ' + vibes(maximum) : trialRemaining !== undefined
          ? `${trialRemaining} trial ${vibeWord(trialRemaining)} left in this chat` : 'Vibes power your AI. You stay in control.'}</Text></View>
  </View>;
}
const s = StyleSheet.create({ wrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5 }, box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 13 },
  input: { fontSize: 16, lineHeight: 24, padding: 4, minHeight: 66, maxHeight: 150, outlineWidth: 0 }, toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  model: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 6, flexShrink: 1 }, modelName: { fontSize: 13, flexShrink: 1 },
  effort: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 9, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, flexShrink: 0 }, effortName: { fontSize: 12 }, spacer: { flex: 1, minWidth: 4 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, estimate: { minHeight: 30, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center' },
  caption: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
