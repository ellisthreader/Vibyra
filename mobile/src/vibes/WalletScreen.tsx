import { useEffect, useState } from 'react';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useVibes } from './VibesProvider';
import { SignedOutPage } from './SignedOutPage';
import { UpgradePage } from './UpgradePage';
import { useWalletPurchase } from './useWalletPurchase';
import { UpgradeCelebration, type UpgradeSuccess } from './UpgradeCelebration';
import { handBack } from './VibesSettingsPage';

/**
 * The upgrade page, as the `vibes` destination. The balance it used to open on is
 * a Settings page now (`VibesSettingsPage`, "Vibyra tokens"), so this destination
 * is only the paywall, reached from that page's "Upgrade your plan". It stays a
 * destination rather than a sheet page because it is a full screen of its own —
 * the light, the mark, the purchase pinned to the bottom.
 *
 * `onBack` leads back to Vibyra tokens, and so does a finished purchase: the Vibes
 * are watched arriving on the balance rather than read about here. `handBack`
 * carries the notice across, since that page is a different mount from this one.
 *
 * `signedIn` is the workspace account, never the wallet. A missing wallet also
 * means a balance that has not loaded yet, so reading it as "signed out" would
 * show a signed-in person the sign-in page — the trap `VibesBalanceRow` records.
 * Signing in is `onSignIn`, raised by whoever owns this destination, so the Vibes
 * area stays free of the workspace model and mounts from a fixture by itself.
 */
export function WalletScreen({
  signedIn,
  onSignIn,
  onBack,
  onClose,
}: {
  signedIn: boolean;
  onSignIn(): void;
  onBack(): void;
  onClose(): void;
}) {
  const { wallet, store } = useVibes();
  const buy = useWalletPurchase(signedIn);
  const still = useReducedMotion();
  const [success, setSuccess] = useState<UpgradeSuccess | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () =>
    void (async () => {
      setRefreshing(true);
      try {
        await store.refresh();
        buy.reloadPrices();
      } finally {
        setRefreshing(false);
      }
    })();
  useEffect(() => {
    if (!buy.notice?.ok) return;
    if (buy.notice.upgrade) {
      setSuccess(buy.notice.upgrade);
      return;
    }
    handBack(buy.notice.text);
    onBack();
    // `onBack` is a fresh closure every render; only a new notice should leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buy.notice]);
  // Every hook above runs whatever the account is, so signing in changes the page
  // without changing how many hooks this render made.
  if (!signedIn) return <SignedOutPage onSignIn={onSignIn} onClose={onClose} />;
  if (success)
    return (
      <UpgradeCelebration
        result={success}
        still={still}
        onDone={() => {
          setSuccess(null);
          if (!success.preview) {
            handBack('Your Pro features and Vibes are ready.');
            onBack();
          }
        }}
      />
    );
  return (
    <UpgradePage
      buy={buy}
      wallet={wallet}
      still={still}
      refreshing={refreshing}
      onPreview={
        __DEV__ && wallet && buy.plan
          ? () =>
              setSuccess({
                plan: buy.plan!.plan!,
                added: buy.plan!.credits,
                balance: wallet.available + buy.plan!.credits,
                preview: true,
              })
          : undefined
      }
      onRefresh={refresh}
      onBack={onBack}
      onClose={onClose}
    />
  );
}
