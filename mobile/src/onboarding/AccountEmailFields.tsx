import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { AccountMode } from './AccountForm';

export function AccountEmailFields({ email, password, onEmail, onPassword, mode, busy, onSubmit }: {
  email: string; password: string; onEmail: (value: string) => void; onPassword: (value: string) => void;
  mode: AccountMode; busy: boolean; onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const passwordInput = useRef<TextInput>(null);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [reveal, setReveal] = useState(false);
  const fieldStyle = (name: typeof focus) => [s.field, { backgroundColor: colors.surface,
    borderColor: focus === name ? colors.accent : colors.border }];
  return <View style={s.fields}>
    <View style={s.group}>
      <Text style={[s.label, { color: colors.text }]}>Email address</Text>
      <View style={fieldStyle('email')}>
        <TextInput accessibilityLabel="Email" value={email} onChangeText={onEmail} placeholder="you@example.com"
          placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          inputMode="email" textContentType="emailAddress" autoComplete="email" editable={!busy}
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()}
          onFocus={() => setFocus('email')} onBlur={() => setFocus(null)} style={[s.input, { color: colors.text }]} />
      </View>
    </View>
    <View style={s.group}>
      <View style={s.labelRow}>
        <Text style={[s.label, { color: colors.text }]}>Password</Text>
        {mode === 'signup' && <Text style={[s.requirement, { color: colors.muted }]}>At least 8 characters</Text>}
      </View>
      <View style={fieldStyle('password')}>
        <TextInput ref={passwordInput} accessibilityLabel="Password" value={password} onChangeText={onPassword}
          placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'} placeholderTextColor={colors.muted}
          secureTextEntry={!reveal} autoCapitalize="none" autoCorrect={false} editable={!busy} returnKeyType="go"
          textContentType={mode === 'signup' ? 'newPassword' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          onSubmitEditing={onSubmit} onFocus={() => setFocus('password')} onBlur={() => setFocus(null)}
          style={[s.input, { color: colors.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
          accessibilityState={{ checked: reveal }} onPress={() => setReveal(!reveal)} style={s.reveal}>
          <Icon name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  fields: { gap: 16 }, group: { gap: 8 }, label: { fontSize: 13, fontWeight: '600' },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  requirement: { fontSize: 12 }, field: { minHeight: 54, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 16, paddingVertical: 14, paddingHorizontal: 16, outlineWidth: 0 },
  reveal: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
});
