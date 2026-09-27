import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';

export function SetupHeading({ title, description }: { title: string; description: string }) {
  const { colors } = useTheme();
  return (
    <View style={form.heading}>
      <Text accessibilityRole="header" style={[form.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[form.description, { color: colors.muted }]}>{description}</Text>
    </View>
  );
}
export function SetupField({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={form.field}>
      <Text style={[form.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          form.input,
          props.multiline && form.multiline,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          props.style,
        ]}
      />
      {hint && <Text style={[form.help, { color: colors.muted }]}>{hint}</Text>}
    </View>
  );
}
export function SetupSection({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={form.field}>
      <Text style={[form.section, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}
/** A card of rows, the way Settings groups them: one hairline frame, rules between rows. */
export function SetupCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[form.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}
export const form = StyleSheet.create({
  body: { gap: 28 },
  heading: { gap: 4 },
  title: { ...font.headline },
  description: { ...font.subhead },
  field: { gap: 8 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600', letterSpacing: -0.15 },
  section: { ...font.section },
  help: { ...font.footnote, fontSize: 12.5 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    outlineWidth: 0,
  },
  multiline: { minHeight: 128, textAlignVertical: 'top' },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
