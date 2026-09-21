import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';

export function SetupHeading({ title, description }: { title: string; description: string }) {
  const { colors } = useTheme();
  return <View style={form.heading}><Text accessibilityRole="header" style={[form.title, { color: colors.text }]}>{title}</Text>
    <Text style={[form.description, { color: colors.muted }]}>{description}</Text></View>;
}
export function SetupField({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const { colors } = useTheme();
  return <View style={form.field}><Text style={[form.label, { color: colors.text }]}>{label}</Text>
    <TextInput placeholderTextColor={colors.muted} {...props} style={[form.input, props.multiline && form.multiline,
      { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }, props.style]} />
    {hint && <Text style={[form.help, { color: colors.muted }]}>{hint}</Text>}</View>;
}
export function SetupSection({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={form.field}><Text style={[form.section, { color: colors.muted }]}>{label}</Text>{children}</View>;
}
export const form = StyleSheet.create({
  body: { gap: 26 }, heading: { gap: 8 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7 },
  description: { fontSize: 14, lineHeight: 21 }, field: { gap: 10 }, label: { fontSize: 14, fontWeight: '500' },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }, help: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 50, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, fontSize: 16, lineHeight: 23 },
  multiline: { minHeight: 150, textAlignVertical: 'top' },
});
