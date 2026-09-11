import * as Browser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Hint, Icon } from '../ui/primitives';
import type { Integration } from './types';

/**
 * Pasting a key. The key is shown rather than masked: it arrives from a clipboard
 * in one go, and a person who cannot see what landed cannot tell a truncated paste
 * from a wrong one. It is written straight to the server and never read back.
 */
export function ConnectForm({ integration, value, onChange, error }: {
  integration: Integration; value: string; onChange(next: string): void; error: string | null;
}) {
  const { colors, dark } = useTheme();
  return <View style={s.form}>
    <Text style={[s.help, { color: colors.muted }]}>{integration.credential.help}</Text>
    <TextInput accessibilityLabel={`${integration.name} ${integration.credential.label.toLowerCase()}`} value={value} onChangeText={onChange}
      placeholder={integration.credential.placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false}
      autoComplete="off" spellCheck={false} keyboardAppearance={dark ? 'dark' : 'light'} maxLength={500}
      style={[s.input, { color: colors.text, backgroundColor: colors.elevated, borderColor: colors.border }]} />
    {integration.credential.url ? <Pressable accessibilityRole="link" accessibilityLabel={`Open ${integration.name} to create a key`}
      onPress={() => void Browser.openBrowserAsync(integration.credential.url)} style={s.link}>
      <Text style={[s.linkText, { color: colors.accent }]}>Where do I get this?</Text>
      <Icon name="open-outline" size={14} color={colors.accent} />
    </Pressable> : null}
    {error && <Hint error>{error}</Hint>}
  </View>;
}
const s = StyleSheet.create({
  form: { gap: 12 },
  help: { fontSize: 14, lineHeight: 21 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14,
    fontSize: 15, outlineWidth: 0 },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontSize: 14, fontWeight: '500' },
});
