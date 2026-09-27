import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../theme';

/**
 * A text box that sits in a card like a row: the same 52pt height and 16pt type, so a
 * page of fields reads as one list with the rows around it. The trailing slot says
 * what happened to the last save — a spinner, then a quiet "Saved" — and nothing else.
 */
export function Field({
  label,
  status,
  ...input
}: TextInputProps & {
  /** Spoken name of the box; the visible label is the card's heading. */
  label: string;
  status?: 'saving' | 'saved' | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.row}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...input}
        style={[s.input, { color: input.editable === false ? colors.muted : colors.text }]}
      />
      {status === 'saving' ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : status === 'saved' ? (
        <Text accessibilityLiveRegion="polite" style={[s.saved, { color: colors.muted }]}>
          Saved
        </Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, minHeight: 52, fontSize: 16, letterSpacing: -0.2, outlineWidth: 0 } as object,
  saved: { fontSize: 14 },
});
