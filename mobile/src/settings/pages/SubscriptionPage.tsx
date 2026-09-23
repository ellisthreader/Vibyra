import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { useWalletPurchase } from '../../vibes/useWalletPurchase';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Row } from '../SettingsRows';
import { APP_STORE_SUBSCRIPTIONS, subscriptionState } from '../subscription';
import { useWallet } from '../useWallet';
import { sampleNote, settingsAccount } from '../whose';

const said = (error: unknown) =>
  error instanceof Error ? error.message : 'Billing couldn’t be opened. Try again.';

/**
 * The plan behind the account, and the three things a person comes here to do with
 * it: change how it is paid for, bring back purchases made on another install, or
 * look at the other plans. Only what the server or the App Store has said is shown;
 * a free account sees its plan and the way to the others, nothing else.
 */
export function SubscriptionPage({ workspace, nav, routes }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const account = settingsAccount(workspace);
  const wallet = useWallet();
  const view = subscriptionState(account, wallet);
  const live = Boolean(workspace.account && !workspace.demo);
  const buy = useWalletPurchase(live);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portal = workspace.actions.openBillingPortal;
  const manage = async () => {
    setError(null);
    if (view.manage !== 'stripe' || !portal) {
      void Linking.openURL(APP_STORE_SUBSCRIPTIONS);
      return;
    }
    setOpening(true);
    try {
      void Linking.openURL(await portal());
    } catch (reason) {
      setError(said(reason));
    } finally {
      setOpening(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* No label over the card: its first row already says "Plan", and two in a row read as a stutter. */}
      <Group>
        <Row title="Plan" value={view.plan} />
        {view.state && <Row title="Status" value={view.state} />}
        {view.billing && <Row title="Billed through" value={view.billing} />}
        {view.cycle && <Row title="Billing" value={view.cycle} />}
      </Group>
      {!view.paid && (
        <Footnote>You’re on the free plan. Paid plans add more Vibes each month.</Footnote>
      )}
      <Group style={s.actions}>
        {view.manage && live && (
          <Row
            title="Manage subscription"
            busy={opening}
            onPress={() => void manage()}
            trailing="external"
          />
        )}
        {live && buy.bridge && (
          <Row title="Restore purchases" busy={buy.busy} onPress={buy.restore} trailing="none" />
        )}
        <Row title="See plans" onPress={() => nav.close(() => routes.wallet('subscription'))} />
      </Group>
      {(error || buy.notice) && (
        <View style={s.notice}>
          <Hint error={Boolean(error) || buy.notice?.ok === false}>
            {error ?? buy.notice?.text}
          </Hint>
        </View>
      )}
      {workspace.demo && <Footnote>{sampleNote(workspace)} Nothing is billed.</Footnote>}
      {live && view.manage === 'appstore' && (
        <Footnote>App Store subscriptions are changed or cancelled in the App Store.</Footnote>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10 },
  actions: { marginTop: 24 },
  notice: { marginTop: 12, marginHorizontal: 16 },
});
