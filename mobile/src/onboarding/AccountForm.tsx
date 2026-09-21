import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { useAction } from '../ui/useAction';
import type { WorkspaceModel } from '../ui/types';
import type { AccountProvider } from '../account/accountApi';
import type { TwoFactorPrompt } from '../ui/types';
import { AccountCodeStep } from './AccountCodeStep';
import { links } from '../settings/links';
import { ProviderButtons } from './ProviderButtons';
import { AccountEmailFields } from './AccountEmailFields';
import { AccountSignedIn } from './AccountSignedIn';

export type AccountMode = 'signup' | 'login';
export function AccountForm({ workspace, mode, onMode, onDone, reason, secondary, continueLabel = 'Continue', onFocusPassword }: {
  workspace: WorkspaceModel; mode: AccountMode; onMode: (mode: AccountMode) => void; onDone: () => void;
  reason?: string; secondary?: ReactNode; continueLabel?: string;
  /** Focusing the password raises the keyboard over the button below it; the page scrolls it back into view. */
  onFocusPassword?: () => void;
}) {
  const { colors } = useTheme();
  const { busy, error, run, clearError } = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [provider, setProvider] = useState<AccountProvider | null>(null);
  // Set when the password was right and this account asks for a code as well.
  const [challenge, setChallenge] = useState<TwoFactorPrompt | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current?.abort(); }; }, []);
  const switchMode = () => { setPassword(''); clearError(); onMode(mode === 'signup' ? 'login' : 'signup'); };
  const submit = async () => {
    if (busy) return;
    const action = mode === 'signup' ? workspace.actions.signUp : workspace.actions.logIn;
    if (!action) return;
    Keyboard.dismiss();
    // A login can end in a challenge rather than a session. Nothing is cleared and
    // nothing is done in that case: the same form asks the second question instead.
    let asked: TwoFactorPrompt | null = null;
    const done = await run(async () => { asked = (await action(email, password)) ?? null; });
    if (!done || !mounted.current) return;
    if (asked) { setChallenge(asked); return; }
    setPassword(''); onDone();
  };
  const answer = async (code: string) => {
    if (busy || !challenge) return;
    Keyboard.dismiss();
    const send = workspace.actions.submitTwoFactorCode;
    if (!send) return;
    if (await run(() => send(challenge.challengeId, code)) && mounted.current) {
      setPassword(''); setChallenge(null); onDone();
    }
  };
  // Leaving the code step abandons the challenge; the password is asked for again,
  // which is what the server would want anyway once this one has expired.
  const leaveCode = () => { clearError(); setChallenge(null); setPassword(''); };
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
  if (challenge && !workspace.account) return <View style={s.form}>
    {reason && <Hint>{reason}</Hint>}
    <AccountCodeStep email={email.trim().toLowerCase()} busy={busy} error={error}
      onSubmit={code => void answer(code)} onBack={leaveCode} />
  </View>;
  if (workspace.account) return <View style={s.form}>
    {reason && <Hint>{reason}</Hint>}
    <AccountSignedIn account={workspace.account} />
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
      busy={busy} onSubmit={() => void submit()} onPasswordFocus={onFocusPassword} />
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
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL(links.terms).catch(() => {}); }}
        style={s.legalLink}>Terms</Text> and{' '}
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL(links.privacy).catch(() => {}); }}
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
});
