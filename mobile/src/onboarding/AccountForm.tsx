import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';
import type { AccountProvider } from '../account/accountApi';
import { ProviderButtons } from './ProviderButtons';
import { AccountEmailFields } from './AccountEmailFields';

export type AccountMode = 'signup' | 'login';
export function AccountForm({ workspace, mode, onMode, onDone, reason, secondary, continueLabel = 'Continue' }: {
  workspace: WorkspaceModel; mode: AccountMode; onMode: (mode: AccountMode) => void; onDone: () => void;
  reason?: string; secondary?: ReactNode; continueLabel?: string;
}) {
  const { colors } = useTheme();
  const { busy, error, run, clearError } = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [provider, setProvider] = useState<AccountProvider | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current?.abort(); }; }, []);
  const switchMode = () => { setPassword(''); clearError(); onMode(mode === 'signup' ? 'login' : 'signup'); };
  const submit = async () => {
    if (busy) return;
    const action = mode === 'signup' ? workspace.actions.signUp : workspace.actions.logIn;
    if (!action) return;
    Keyboard.dismiss();
    if (await run(() => action(email, password)) && mounted.current) { setPassword(''); onDone(); }
  };
  const social = async (selected: AccountProvider) => {
    if (busy || attempt.current) return;
    const controller = new AbortController(); attempt.current = controller;
    setProvider(selected); Keyboard.dismiss();
    let completed = false;
    await run(async () => {
      if (!workspace.actions.providerLogIn) throw new Error('Provider sign-in is unavailable. Please use email.');
      try { completed = await workspace.actions.providerLogIn(selected, controller.signal); }
      catch (error) { if (!controller.signal.aborted) throw error; }
    });
    attempt.current = null; setProvider(null);
    if (completed && !controller.signal.aborted) { setPassword(''); onDone(); }
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
    <ProviderButtons busy={busy} active={provider} onPress={selected => void social(selected)} />
    {provider && <View style={s.pending}>
      <Hint>Finish signing in with {provider === 'apple' ? 'Apple' : 'Google'}.</Hint>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel sign-in" onPress={() => attempt.current?.abort()} style={s.cancel}>
        <Text style={{ color: colors.accent }}>Cancel</Text>
      </Pressable>
    </View>}
    <View style={s.separator}>
      <View style={[s.rule, { backgroundColor: colors.border }]} />
      <Text style={[s.separatorText, { color: colors.muted }]}>or continue with email</Text>
      <View style={[s.rule, { backgroundColor: colors.border }]} />
    </View>
    <AccountEmailFields key={mode} mode={mode} email={email} password={password} onEmail={setEmail} onPassword={setPassword}
      busy={busy} onSubmit={() => void submit()} />
    {error && <View accessibilityRole="alert" style={[s.error, { backgroundColor: colors.errorSoft }]}>
      <Icon name="alert-circle-outline" size={19} color={colors.error} /><View style={s.errorText}><Hint error>{error}</Hint></View>
    </View>}
    <Button title={mode === 'signup' ? 'Create account' : 'Log in'} busy={busy && !provider} disabled={busy || !email.trim() || !password}
      onPress={() => void submit()} />
    <View style={s.switch}>
      <Text style={[s.switchText, { color: colors.muted }]}>{mode === 'signup' ? 'Already have an account?' : 'New to Vibyra?'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'signup' ? 'Log in' : 'Create an account'} disabled={busy}
        accessibilityState={{ disabled: busy }} aria-disabled={busy} onPress={switchMode} style={s.switchLink}>
        <Text style={[s.switchLinkText, { color: colors.accent }]}>{mode === 'signup' ? 'Log in' : 'Create an account'}</Text>
      </Pressable>
    </View>
    <Text style={[s.legal, { color: colors.muted }]}>By continuing, you agree to our{' '}
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL('https://vibyra.app/legal/terms'); }}
        style={s.legalLink}>Terms</Text> and{' '}
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL('https://vibyra.app/legal/privacy'); }}
        style={s.legalLink}>Privacy Policy</Text>.</Text>
    {secondary}
  </View>;
}
const s = StyleSheet.create({
  form: { gap: 16 }, separator: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 },
  rule: { height: StyleSheet.hairlineWidth, flex: 1 }, separatorText: { fontSize: 12 },
  pending: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  error: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'flex-start' }, errorText: { flex: 1 },
  switch: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 5, minHeight: 44, marginTop: -6 },
  switchText: { fontSize: 14 }, switchLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  switchLinkText: { fontSize: 14, fontWeight: '600' },
  legal: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300, alignSelf: 'center', marginTop: -6 },
  legalLink: { textDecorationLine: 'underline' },
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 17, fontWeight: '700' },
  signedInText: { flex: 1, gap: 2 }, signedInTitle: { fontSize: 15, fontWeight: '600' }, signedInEmail: { fontSize: 13 },
});
