import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon, type IconName } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';

export type AccountMode = 'signup' | 'login';
export function AccountForm({ workspace, mode, onMode, onDone, reason, secondary, continueLabel = 'Continue' }: {
  workspace: WorkspaceModel; mode: AccountMode; onMode: (mode: AccountMode) => void; onDone: () => void;
  reason?: string; secondary?: ReactNode; continueLabel?: string;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const submit = async () => {
    const action = mode === 'signup' ? workspace.actions.signUp : workspace.actions.logIn;
    if (!action) return;
    if (await run(() => action(email, password))) { setPassword(''); onDone(); }
  };
  if (workspace.account) return <View style={s.form}>
    {reason && <Hint>{reason}</Hint>}
    <View style={[s.signedIn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[s.avatar, { backgroundColor: colors.accentSoft }]}>
        <Text style={[s.avatarText, { color: colors.accent }]}>{(workspace.account.name || workspace.account.email).slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={s.signedInText}>
        <Text numberOfLines={1} style={[s.signedInTitle, { color: colors.text }]}>{workspace.account.name || 'Signed in'}</Text>
        <Text numberOfLines={1} style={[s.signedInEmail, { color: colors.muted }]}>{workspace.account.email}</Text>
      </View>
      <Icon name="checkmark-circle" size={22} color={colors.success} />
    </View>
    <Button title={continueLabel} onPress={onDone} />
  </View>;
  return <View style={s.form}>
    {reason && <Hint>{reason}</Hint>}
    <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Field icon="mail-outline">
        <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" inputMode="email" textContentType="emailAddress"
          autoComplete="email" editable={!busy} returnKeyType="next" style={[s.input, { color: colors.text }]} />
      </Field>
      <View style={[s.divider, { backgroundColor: colors.border }]} />
      <Field icon="lock-closed-outline">
        <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted}
          secureTextEntry={!reveal} autoCapitalize="none" autoCorrect={false} editable={!busy} returnKeyType="go"
          textContentType={mode === 'signup' ? 'newPassword' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'password'}
          onSubmitEditing={() => void submit()} style={[s.input, { color: colors.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'} onPress={() => setReveal(!reveal)} style={s.reveal}>
          <Icon name={reveal ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
        </Pressable>
      </Field>
    </View>
    {error ? <Hint error>{error}</Hint> : mode === 'signup' && <Hint>At least 8 characters.</Hint>}
    <View style={[s.glowButton, { shadowColor: colors.accent }]}>
      <Button title={mode === 'signup' ? 'Create account' : 'Log in'} busy={busy} disabled={!email.trim() || !password} onPress={() => void submit()} />
    </View>
    {secondary}
    <View style={s.switch}>
      <Text style={[s.switchText, { color: colors.muted }]}>{mode === 'signup' ? 'Already have an account?' : 'New to Vibyra?'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'signup' ? 'Log in' : 'Create an account'} disabled={busy}
        onPress={() => onMode(mode === 'signup' ? 'login' : 'signup')} style={s.switchLink}>
        <Text style={[s.switchLinkText, { color: colors.accent }]}>{mode === 'signup' ? 'Log in' : 'Create an account'}</Text>
      </Pressable>
    </View>
  </View>;
}
function Field({ icon, children }: { icon: IconName; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={s.field}><Icon name={icon} size={19} color={colors.muted} />{children}</View>;
}
const s = StyleSheet.create({
  form: { gap: 14 },
  group: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  field: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 6 },
  input: { flex: 1, fontSize: 16, paddingVertical: 14, minHeight: 56 }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 47 },
  reveal: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  glowButton: { shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5, borderRadius: 18 },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  switchText: { fontSize: 14 }, switchLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 }, switchLinkText: { fontSize: 14, fontWeight: '600' },
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 17, fontWeight: '700' },
  signedInText: { flex: 1, gap: 2 }, signedInTitle: { fontSize: 15, fontWeight: '600' }, signedInEmail: { fontSize: 13 },
});
