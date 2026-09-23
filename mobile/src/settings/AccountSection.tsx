import { StyleSheet } from 'react-native';
import type { WorkspaceModel } from '../ui/types';
import { walletHeadline } from '../vibes/walletHeadline';
import type { SettingsNav } from './pages';
import { Group, Label, Row } from './SettingsRows';
import { subscriptionState } from './subscription';
import { useAccountDevices } from './useAccountDevices';
import { useWallet } from './useWallet';
import { isTestAccount, settingsAccount } from './whose';

/**
 * The Account group, in every state. Signed in: your Vibyra tokens, the plan behind
 * them, where you are signed in, and — alone, last, in red — the way out of the
 * account. Who you are is the card above, which is also the way to your profile.
 * Signed out: the tokens a guest already has and a way to make an account (the
 * header keeps Sign in). In the sample, the same rows over memory.
 */
export function AccountSection({
  workspace,
  nav,
}: {
  workspace: WorkspaceModel;
  nav: SettingsNav;
}) {
  const account = settingsAccount(workspace);
  const wallet = useWallet();
  const devices = useAccountDevices(workspace).devices;
  const manage = Boolean(account && workspace.actions.updateProfile);
  // The plan is the card's badge; here the row answers with the balance alone.
  const tokens = wallet ? walletHeadline(wallet).figure.toLocaleString() : null;
  // The real account's delete, or the test account's page that explains why it can't be.
  const deletable = Boolean(
    account && (isTestAccount(workspace) || (!workspace.demo && workspace.actions.deleteAccount)),
  );
  const canCreate = !account && !workspace.demo && Boolean(workspace.actions.signUp);
  return (
    <>
      <Label>Account</Label>
      <Group>
        <Row title="Vibyra tokens" value={tokens} onPress={() => nav.push('vibes')} />
        {account && (
          <Row
            title="Subscription"
            value={subscriptionState(account, wallet).row}
            onPress={() => nav.push('subscription')}
          />
        )}
        {manage && (
          <Row
            title="Security"
            value={devices ? `${devices.length} device${devices.length === 1 ? '' : 's'}` : null}
            onPress={() => nav.push('security')}
          />
        )}
        {canCreate && <Row title="Create account" onPress={() => nav.signIn('signup')} />}
      </Group>
      {deletable && (
        <Group style={s.delete}>
          <Row title="Delete account" danger onPress={() => nav.push('delete')} trailing="none" />
        </Group>
      )}
    </>
  );
}
const s = StyleSheet.create({
  delete: { marginTop: 12 },
});
