import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { Field } from '../Field';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row } from '../SettingsRows';
import { isTestAccount, sampleNote, settingsAccount } from '../whose';

const providerNames = { apple: 'Apple', google: 'Google', github: 'GitHub' } as const;
const said = (error: unknown) =>
  error instanceof Error ? error.message : 'That could not be saved. Try again.';
const month = (iso?: string) =>
  iso && !Number.isNaN(Date.parse(iso))
    ? new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

/**
 * The account's name and email, and the way out of it. The name saves when the box
 * is left; an email saves only on Done, because changing it sends a confirmation
 * link. An Apple or Google account's email belongs to that provider, so it is shown,
 * not offered. Delete account is last, in red, and opens its own page.
 */
export function ProfilePage({ workspace, nav }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const account = settingsAccount(workspace);
  const { updateProfile, resendVerification } = workspace.actions;
  // The sample's name changes on screen only; its email stays, because a link can't be sent.
  const editable = Boolean(updateProfile && account);
  const emailEditable = editable && !workspace.demo;
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [status, setStatus] = useState<{
    field: 'name' | 'email';
    state: 'saving' | 'saved';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Return submits and then blurs the box, and both save: without this one rename was two requests.
  const sending = useRef<string | null>(null);
  useEffect(() => {
    setName(account?.name ?? '');
    setEmail(account?.email ?? '');
  }, [account?.name, account?.email]);
  useEffect(() => {
    if (status?.state !== 'saved') return;
    const timer = setTimeout(() => setStatus(null), 2200);
    return () => clearTimeout(timer);
  }, [status]);
  if (!account) return null;
  const provider =
    account.provider && account.provider !== 'email' ? providerNames[account.provider] : null;
  const save = async (field: 'name' | 'email') => {
    const value = (field === 'name' ? name : email).trim();
    const current = field === 'name' ? account.name : account.email;
    if (
      !updateProfile ||
      value === current ||
      (field === 'email' && value.toLowerCase() === current)
    )
      return;
    if (sending.current === `${field}:${value}`) return;
    sending.current = `${field}:${value}`;
    setError(null);
    setNote(null);
    setStatus({ field, state: 'saving' });
    try {
      await updateProfile(field === 'name' ? { name: value } : { email: value });
      setStatus({ field, state: 'saved' });
      if (field === 'email') setNote(`We’ve sent a link to ${value.toLowerCase()} to confirm it.`);
    } catch (reason) {
      setStatus(null);
      setError(said(reason));
      if (field === 'name') setName(account.name);
      else setEmail(account.email);
    } finally {
      sending.current = null;
    }
  };
  const resend = async () => {
    if (!resendVerification) return;
    setError(null);
    try {
      setNote(await resendVerification());
    } catch (reason) {
      setError(said(reason));
    }
  };
  return (
    <ScrollView
      contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Label first>Name</Label>
      <Group>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          editable={editable}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          maxLength={80}
          onSubmitEditing={() => void save('name')}
          onBlur={() => void save('name')}
          status={status?.field === 'name' ? status.state : null}
        />
      </Group>
      <Label>Email</Label>
      <Group>
        {provider ? (
          <Row title={account.email} detail={`Signed in with ${provider}`} />
        ) : (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={() => void save('email')}
            status={status?.field === 'email' ? status.state : null}
            editable={emailEditable}
          />
        )}
        {!provider && account.emailVerified === false && resendVerification ? (
          <Row title="Resend confirmation email" onPress={() => void resend()} trailing="none" />
        ) : null}
      </Group>
      <Footnote>
        {provider
          ? `${provider} manages this address. Change it in your ${provider} account.`
          : workspace.demo
            ? 'The sample’s email can’t be changed.'
            : account.emailVerified === false
              ? 'This address isn’t confirmed yet. Check your inbox for the link.'
              : 'Change it and we’ll email a link to confirm the new address.'}
      </Footnote>
      {(error || note) && (
        <View style={s.notice}>
          <Hint error={Boolean(error)}>{error ?? note}</Hint>
        </View>
      )}
      {month(account.createdAt) && (
        <>
          <Label>Account</Label>
          <Group>
            <Row title="Member since" value={month(account.createdAt)} />
          </Group>
        </>
      )}
      {!editable && <Footnote>Your details can’t be changed on this phone yet.</Footnote>}
      {workspace.demo && <Footnote>{sampleNote(workspace)}</Footnote>}
      {(isTestAccount(workspace) || (!workspace.demo && workspace.actions.deleteAccount)) && (
        <Group style={s.danger}>
          <Row title="Delete account" danger onPress={() => nav.push('delete')} trailing="none" />
        </Group>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  notice: { marginTop: 12, marginHorizontal: 16 },
  danger: { marginTop: 32 },
});
