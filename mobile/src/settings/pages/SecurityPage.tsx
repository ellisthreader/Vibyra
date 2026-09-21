import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { confirmAction } from '../../ui/confirm';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint, Icon } from '../../ui/primitives';
import type { AccountDevice } from '../../ui/types';
import { activeLabel } from '../activeLabel';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row } from '../SettingsRows';
import { useAccountDevices } from '../useAccountDevices';
import { sampleNote, settingsAccount } from '../whose';

const providerNames = { apple: 'Apple', google: 'Google', github: 'GitHub' } as const;
const said = (error: unknown) => error instanceof Error ? error.message : 'That didn’t work. Try again.';

/**
 * Keeping the account the person's own: the password (a reset link for an email
 * account; the provider's business otherwise), every place the account is signed in,
 * and one way to sign them all out. This phone is marked rather than removable here —
 * Log out is how it leaves — and signing out everywhere includes it, which it says.
 */
export function SecurityPage({ workspace, nav }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const account = settingsAccount(workspace);
  const { sendPasswordReset, removeAccountDevice, signOutEverywhere } = workspace.actions;
  const { devices, error: loadError, loading, reload, available, drop } = useAccountDevices(workspace);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  if (!account) return null;
  const provider = account.provider && account.provider !== 'email' ? providerNames[account.provider] : null;
  const act = async (key: string, work: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await work(); } catch (reason) { setError(said(reason)); } finally { setBusy(null); }
  };
  // The sample sends nothing and says so; a real account is told where the link went.
  const reset = () => void act('reset', async () => {
    const note = await sendPasswordReset!();
    setSent(workspace.demo ? note : `We’ve emailed a reset link to ${account.email}.`);
  });
  const remove = (device: AccountDevice) => confirmAction(`Remove ${device.name}?`,
    'It’s signed out of your Vibyra account. Your work on it isn’t affected.', 'Remove',
    () => void act(device.id, async () => { await removeAccountDevice!(device.id); drop(device.id); }));
  const everywhere = () => confirmAction('Sign out of all devices?',
    'Every phone, computer and browser signed in to your account is signed out, including this one.', 'Sign out',
    () => void act('everywhere', async () => { await signOutEverywhere!(); nav.close(); }));
  // Straight from the cached account, so the row answers itself the moment the page
  // opens and changes the moment the second factor does. An older server that says
  // nothing about it leaves the row blank rather than claiming it is off.
  const second = account.twoFactorEnabled;
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]} showsVerticalScrollIndicator={false}>
    <Label first>Signing in</Label>
    <Group>
      {provider ? <Row title="Password" value={`Managed by ${provider}`} />
        : <Row title="Reset password" busy={busy === 'reset'} disabled={!sendPasswordReset}
          onPress={reset} trailing="none" />}
      {!provider && (workspace.actions.loadTwoFactor || workspace.demo) && <Row title="Two-factor authentication"
        value={second === undefined ? null : second ? 'On' : 'Off'} dot={second ? colors.success : undefined}
        label={`Two-factor authentication, ${second ? 'on' : 'off'}`} onPress={() => nav.push('twoFactor')} />}
    </Group>
    {sent && <Footnote>{sent}</Footnote>}
    {!provider && second === false && <Footnote>Two-factor authentication asks for a code as well as
      your password, so a stolen password isn’t enough on its own.</Footnote>}
    {available && <>
      <Label>Signed-in devices</Label>
      {devices ? <Group>
        {devices.map(device => <Row key={device.id} title={device.name}
          detail={[device.current ? 'This phone' : activeLabel(device.lastActive), device.location].filter(Boolean).join(' · ')}
          right={device.current || !removeAccountDevice ? null
            : <RemoveButton name={device.name} busy={busy === device.id} onPress={() => remove(device)} />} />)}
      </Group> : <Group>
        <Row title={loadError ? 'Your devices couldn’t be loaded' : 'Loading devices…'} busy={loading}
          onPress={loadError ? () => void reload() : undefined} trailing="none" value={loadError ? 'Try again' : null} />
      </Group>}
    </>}
    {error && <View style={s.notice}><Hint error>{error}</Hint></View>}
    {signOutEverywhere && !workspace.demo && <>
      <Group style={s.danger}>
        <Row title="Sign out of all devices" danger busy={busy === 'everywhere'} onPress={everywhere} trailing="none" />
      </Group>
      <Footnote>Includes this phone. You can sign in again at any time.</Footnote>
    </>}
    {workspace.demo && <Footnote>{sampleNote(workspace)}</Footnote>}
  </ScrollView>;
}
function RemoveButton({ name, busy, onPress }: { name: string; busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} accessibilityState={{ busy, disabled: busy }}
    disabled={busy} onPress={onPress} hitSlop={8} style={({ pressed }) => [s.remove, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
    <Icon name="remove-circle-outline" size={22} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  notice: { marginTop: 12, marginHorizontal: 2 },
  danger: { marginTop: 32 },
  remove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
