import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, IconButton } from '../../ui/primitives';
import { font } from '../../ui/font';
import { SetupHeading, form } from './SetupForm';

export function SetupRoutines({
  routines,
  suggestion,
  disabled,
  onChange,
}: {
  routines: string[];
  suggestion: string;
  disabled: boolean;
  onChange(routines: string[]): void;
}) {
  const { colors } = useTheme();
  return (
    <View style={form.body}>
      <SetupHeading
        title="Routine plans"
        description="Save up to two ideas for recurring work. Scheduling and notifications aren’t available yet."
      />
      {!routines.length && Boolean(suggestion) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use suggested routine"
          disabled={disabled}
          onPress={() => onChange([suggestion])}
          style={({ pressed }) => [
            s.suggestion,
            {
              backgroundColor: pressed ? colors.elevated : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[s.kicker, { color: colors.muted }]}>Suggested routine</Text>
          <Text style={[s.text, { color: colors.text }]}>{suggestion}</Text>
          <Text style={[s.use, { color: colors.accent }]}>Use this idea →</Text>
        </Pressable>
      )}
      {routines.map((routine, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={s.row}>
            <Text style={[s.draft, { color: colors.text }]}>Routine {i + 1} · draft</Text>
            <IconButton
              icon="close"
              label={`Remove routine ${i + 1}`}
              disabled={disabled}
              onPress={() => onChange(routines.filter((_, index) => i !== index))}
            />
          </View>
          <TextInput
            accessibilityLabel={`Routine ${i + 1}`}
            value={routine}
            editable={!disabled}
            multiline
            maxLength={4000}
            onChangeText={(value) =>
              onChange(routines.map((v, index) => (i === index ? value : v)))
            }
            placeholder="Every Friday at 9, review my notes and list open decisions…"
            placeholderTextColor={colors.muted}
            style={[
              form.input,
              form.multiline,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
        </View>
      ))}
      {routines.length < 2 && (
        <Button
          secondary
          title={routines.length ? 'Add a second routine' : 'Write my own routine'}
          disabled={disabled}
          onPress={() => onChange([...routines, ''])}
        />
      )}
      {routines.length > 0 && (
        <Hint>
          Include the time and timezone, sources, and the result you want. Mention which updates
          deserve your attention.
        </Hint>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  text: { ...font.body },
  draft: { fontSize: 14, lineHeight: 19, fontWeight: '600', letterSpacing: -0.15, flex: 1 },
  suggestion: { padding: 16, gap: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  kicker: { ...font.section },
  use: { fontSize: 14, fontWeight: '600', letterSpacing: -0.15, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
