import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import { RequestFrame } from './RequestFrame';
import type { ConversationQuestion, ConversationViewProps } from './types';

export type QuestionDraft = { selected: Record<string, string>; written: Record<string, string> };
export function QuestionCard({ item, canRespond, onAnswer, draft, onDraft, onEditing }: {
  item: ConversationQuestion; canRespond: boolean; onAnswer: ConversationViewProps['onAnswer'];
  draft?: QuestionDraft; onDraft?: (draft: QuestionDraft) => void; onEditing?: (editing: boolean) => void;
}) {
  const { colors, dark } = useTheme();
  const [selected, setSelected] = useState<Record<string, string>>(draft?.selected ?? {});
  const [written, setWritten] = useState<Record<string, string>>(draft?.written ?? {});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const disabled = !canRespond || sending || item.status !== 'pending';
  const complete = item.questions.length > 0 && item.questions.every(q => Boolean(written[q.id]?.trim() || selected[q.id]));
  const submit = async () => {
    if (disabled || !complete || inFlight.current) return;
    inFlight.current = true; setSending(true); setError(undefined);
    const answers = Object.fromEntries(item.questions.map(q => [q.id, [written[q.id]?.trim() || selected[q.id]]]));
    try { await onAnswer(item.id, answers); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send your answer.'); }
    finally { setSending(false); inFlight.current = false; }
  };
  return <RequestFrame title={item.title} icon="chatbubble-ellipses-outline"
    status={sending ? 'resolving' : item.status} canRespond={canRespond} error={error}>
    {item.questions.map(question => <View key={question.id} style={s.question}>
      <Text style={[s.prompt, { color: colors.text }]}>{question.prompt}</Text>
      {question.options.map(option => {
        const checked = selected[question.id] === option.id && !written[question.id]?.trim();
        return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label}
          accessibilityState={{ checked, disabled }} aria-checked={checked} disabled={disabled}
          onPress={() => {
            const next = { selected: { ...selected, [question.id]: option.id }, written: { ...written, [question.id]: '' } };
            setSelected(next.selected); setWritten(next.written); onDraft?.(next);
          }}
          style={[s.option, { borderColor: checked ? colors.accent : colors.border,
            backgroundColor: checked ? colors.accentSoft : 'transparent', opacity: disabled ? 0.6 : 1 }]}>
          <View style={s.optionCopy}><Text style={[s.optionTitle, { color: colors.text }]}>{option.label}</Text>
            {option.description && <Text style={[s.description, { color: colors.muted }]}>{option.description}</Text>}</View>
          <Icon name={checked ? 'radio-button-on' : 'radio-button-off'} size={21} color={checked ? colors.accent : colors.muted} />
        </Pressable>;
      })}
      {(question.allowFreeform || question.options.length === 0) && <TextInput
        accessibilityLabel={`Your answer: ${question.prompt}`} placeholder="Or write your own answer…"
        placeholderTextColor={colors.muted} value={written[question.id] ?? ''} editable={!disabled}
        onChangeText={text => { const next = { ...written, [question.id]: text };
          setWritten(next); onDraft?.({ selected, written: next }); }}
        onFocus={() => onEditing?.(true)} onBlur={() => onEditing?.(false)}
        multiline={!question.secret} secureTextEntry={question.secret} keyboardAppearance={dark ? 'dark' : 'light'}
        style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.elevated }]} />}
    </View>)}
    {item.status === 'pending' && <Button title="Send answer" disabled={disabled || !complete} onPress={() => void submit()} />}
  </RequestFrame>;
}
const s = StyleSheet.create({
  question: { gap: 9 }, prompt: { fontSize: 16, lineHeight: 24, marginBottom: 3 },
  option: { minHeight: 52, borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionCopy: { flex: 1, gap: 4 }, optionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  description: { fontSize: 13, lineHeight: 19 }, input: { minHeight: 52, maxHeight: 150, borderWidth: 1,
    borderRadius: 14, padding: 13, fontSize: 15, lineHeight: 22 },
});
