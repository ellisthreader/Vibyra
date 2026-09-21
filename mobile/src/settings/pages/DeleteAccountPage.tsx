import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { confirmAction } from '../../ui/confirm';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { Field } from '../Field';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row } from '../SettingsRows';
import { isTestAccount } from '../whose';

const SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';
const providerNames = { apple: 'Apple', google: 'Google', github: 'GitHub' } as const;

/**
 * Deleting the account, which App Review requires the app itself to offer. It says
 * plainly what goes, that an App Store subscription is the App Store's to cancel, and
 * asks for proof the account is theirs: the password, or signing in with Apple or
 * Google again. It always asks once more before anything is sent; once the account is
 * gone the phone is signed out and the sheet closes.
 */
export function DeleteAccountPage({ workspace, nav }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const account = workspace.account;
  const remove = workspace.actions.deleteAccount;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);
  if (isTestAccount(workspace)) return <TestAccount bottom={bottom} onLeave={() => nav.close(workspace.actions.exitDemo)} />;
  if (!account || !remove) return null;
  const provider = account.provider && account.provider !== 'email' ? account.provider : null;
  // Apple and Google are asked again; a GitHub-made account has nothing to present
  // again, so the signed-in session is the proof and the confirm is the whole step.
  const reauth = provider === 'apple' || provider === 'google' ? provider : null;
  const run = () => {
    const controller = new AbortController();
    attempt.current = controller;
    setBusy(true); setError(null); setWaiting(Boolean(reauth));
    void remove(provider ? { provider } : { password }, controller.signal).then(deleted => {
      if (deleted) nav.close();
    }, reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Your account could not be deleted. Try again.'); })
      .finally(() => { if (attempt.current === controller) { attempt.current = null; setBusy(false); setWaiting(false); } });
  };
  const confirm = () => confirmAction('Delete your account?',
    'Your chats, Vibes, plugin connections and photo are deleted for good. This can’t be undone.', 'Delete account', run);
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]} keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}>
    <Text style={[s.lead, { color: colors.text }]}>Deleting your account removes your chats, your Vibes and plan balance, your plugin
      connections and your profile photo. It can’t be undone.</Text>
    <Group style={s.first}>
      <Row title="Manage subscriptions" trailing="external" onPress={() => void Linking.openURL(SUBSCRIPTIONS)} />
    </Group>
    <Footnote>Deleting your account doesn’t cancel an App Store subscription. Cancel it there first.</Footnote>
    {reauth ? <>
      <Label>Confirm it’s you</Label>
      <Group>
        <Row title={waiting ? `Finish in the ${reauth === 'apple' ? 'Apple' : 'browser'} window` : `Continue with ${providerNames[reauth]}`}
          icon={reauth === 'apple' ? 'logo-apple' : 'logo-google'} busy={busy} onPress={confirm} trailing="none" />
        {waiting ? <Row title="Cancel" onPress={() => attempt.current?.abort()} trailing="none" /> : null}
      </Group>
    </> : provider ? null : <>
      <Label>Confirm with your password</Label>
      <Group>
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
          autoComplete="current-password" textContentType="password" placeholder="Password" returnKeyType="go"
          editable={!busy} onSubmitEditing={() => { if (password) confirm(); }} />
      </Group>
    </>}
    {error && <View style={s.notice}><Hint error>{error}</Hint></View>}
    {!reauth && <Group style={s.danger}>
      <Row title="Delete account" danger busy={busy} disabled={!provider && !password} onPress={confirm} trailing="none" />
    </Group>}
  </ScrollView>;
}
/** The test account holds nothing to delete, so its page says so and offers the one
 *  thing that does clear it: leaving the sample workspace. */
function TestAccount({ bottom, onLeave }: { bottom: number; onLeave?: () => void }) {
  const { colors } = useTheme();
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]} showsVerticalScrollIndicator={false}>
    <Text style={[s.lead, { color: colors.text }]}>This is the test account, so it can’t be deleted. Nothing in it is saved,
      and leaving the sample workspace clears it.</Text>
    {onLeave && <Group style={s.first}><Row title="Leave the sample workspace" onPress={onLeave} trailing="none" /></Group>}
    <Footnote>Your own account can be deleted here once you’re signed in to it.</Footnote>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  lead: { fontSize: 15, lineHeight: 22, marginTop: 8, marginHorizontal: 2 },
  first: { marginTop: 20 },
  notice: { marginTop: 12, marginHorizontal: 2 },
  danger: { marginTop: 26 },
});
