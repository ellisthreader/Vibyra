import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, IconButton } from '../../ui/primitives';

import { SetupHeading, form } from './SetupForm';

export function SetupRoutines({ routines, suggestion, disabled, onChange }: {
  routines: string[]; suggestion: string; disabled: boolean; onChange(routines: string[]): void;
}) {
  const { colors } = useTheme();
  return <View style={form.body}>
    <SetupHeading title="Routine plans" description="Save up to two ideas for recurring work. Scheduling and notifications aren’t available yet." />
    {!routines.length && Boolean(suggestion) && <Pressable accessibilityRole="button" accessibilityLabel="Use suggested routine" disabled={disabled}
      onPress={() => onChange([suggestion])} style={[s.suggestion, { backgroundColor: colors.elevated }]}>
      <Text style={[s.kicker, { color: colors.accent }]}>SUGGESTED ROUTINE</Text>
      <Text style={[s.text, { color: colors.text }]}>{suggestion}</Text>
      <Text style={{ color: colors.accent, fontSize: 14 }}>Use this idea →</Text>
    </Pressable>}
    {routines.map((routine, i) => <View key={i} style={{ gap: 8 }}>
      <View style={s.row}><Text style={[s.text, { color: colors.text, flex: 1 }]}>Routine {i + 1} · draft</Text>
        <IconButton icon="close" label={`Remove routine ${i + 1}`} disabled={disabled} onPress={() => onChange(routines.filter((_, index) => i !== index))} /></View>
      <TextInput accessibilityLabel={`Routine ${i + 1}`} value={routine} editable={!disabled} multiline maxLength={4000}
        onChangeText={value => onChange(routines.map((v, index) => i === index ? value : v))}
        placeholder="Every Friday at 9, review my notes and list open decisions…" placeholderTextColor={colors.muted}
        style={[s.input, { backgroundColor: colors.elevated, color: colors.text }]} />
    </View>)}
    {routines.length < 2 && <Button secondary title={routines.length ? 'Add a second routine' : 'Write my own routine'} disabled={disabled} onPress={() => onChange([...routines, ''])} />}
    {routines.length > 0 && <Hint>Include the time and timezone, sources, and the result you want. Mention which updates deserve your attention.</Hint>}
  </View>;
}
const s = StyleSheet.create({ body: { gap: 18 }, title: { fontSize: 25, lineHeight: 31, fontWeight: '600', letterSpacing: -0.5 },
  text: { fontSize: 16, lineHeight: 24 }, suggestion: { padding: 18, gap: 12, borderRadius: 18 }, kicker: { fontSize: 11, letterSpacing: 1, fontWeight: '600' },
  input: { minHeight: 136, padding: 14, borderRadius: 16, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' }, row: { flexDirection: 'row', alignItems: 'center' } });
