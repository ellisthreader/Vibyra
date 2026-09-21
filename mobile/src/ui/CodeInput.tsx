import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';

const LENGTH = 6;

/**
 * The six digits, as six boxes over one real text box.
 *
 * One box rather than six is what makes this work: the keyboard's own one-time-code
 * suggestion, a pasted code and a code typed slowly all arrive the same way, and
 * there is no focus to shuffle between fields when somebody deletes a digit. The
 * boxes are drawn from its value, and the caret is the box that is next.
 *
 * A complete code submits itself. Nobody has ever wanted to type six digits and then
 * look for a button, and the code is only good for another few seconds anyway.
 */
export function CodeInput({ value, onChange, onComplete, busy, autoFocus, label = 'Six-digit code' }: {
  value: string; onChange: (value: string) => void; onComplete: (value: string) => void;
  busy?: boolean; autoFocus?: boolean; label?: string;
}) {
  const { colors } = useTheme();
  const field = useRef<TextInput>(null);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (value.length < LENGTH) { if (value.length === 0) sent.current = null; return; }
    // Sent once per code: a failed code that is retyped identically must go again,
    // but the same value re-rendering must not.
    if (sent.current === value) return;
    sent.current = value;
    onComplete(value);
  }, [value, onComplete]);
  const digits = [...Array(LENGTH)].map((_, at) => value[at] ?? '');
  const caret = focused && !busy ? Math.min(value.length, LENGTH - 1) : -1;
  return <Pressable accessibilityRole="none" onPress={() => field.current?.focus()} style={s.row}>
    {digits.map((digit, at) => <View key={at} style={[s.box, {
      backgroundColor: colors.surface,
      borderColor: at === caret ? colors.accent : colors.border,
      borderWidth: at === caret ? 2 : StyleSheet.hairlineWidth,
    }]}>
      <Text style={[s.digit, { color: colors.text }]}>{digit}</Text>
    </View>)}
    <TextInput ref={field} accessibilityLabel={label} value={value} editable={!busy}
      onChangeText={text => onChange(text.replace(/\D+/g, '').slice(0, LENGTH))}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoFocus={autoFocus}
      keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
      inputMode="numeric" maxLength={LENGTH} caretHidden style={s.hidden} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: { flex: 1, maxWidth: 52, aspectRatio: 0.82, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // Over the boxes, not beside them: a tap anywhere on the row is a tap on the field,
  // and on the web the caret would otherwise be drawn somewhere of its own.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent',
    ...Platform.select({ web: { outlineWidth: 0 }, default: {} }) } as object,
});
