import { useEffect, useState } from 'react';
import { useCountUp } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useVibes } from './VibesProvider';
import { BalancePage } from './BalancePage';
import { SignedOutPage } from './SignedOutPage';
import { UpgradePage } from './UpgradePage';
import { useWalletPurchase } from './useWalletPurchase';

/**
 * The Vibes area: three pages, and which of them is showing. It is a destination
 * rather than a modal — a sheet raised while the navigation rail's own modal
 * dismissed never appeared on iOS, which is why tapping the balance used to do
 * nothing — and all three live inside that one destination, so the X always
 * returns to `returnTo` while the upgrade's back returns to the balance.
 *
 * `signedIn` is the workspace account, never the wallet. A missing wallet also
 * means a balance that has not loaded yet, so reading it as "signed out" would
 * show a signed-in person the sign-in page — the trap `VibesBalanceRow` records.
 * Signing in is `onSignIn`, raised by whoever owns this destination: the sheet
 * that does it belongs to the workspace, and the Vibes area stays free of the
 * workspace model so its pages can be mounted from a fixture by themselves.
 *
 * Being signed out is the reason `useWalletPurchase` is told whether this area is
 * active. It refreshes the wallet when it is, and with no account that call fails
 * 401 and leaves "Sign in to use your Vibes." on the store — which is exactly the
 * red error that used to greet a guest arriving from the rail's "Vibyra tokens".
 * The page has one thing to say in that state, and it is not an error.
 *
 * Purchasing is held here, above the pages, for two reasons: the wallet and the
 * Apple prices are fetched once for the area instead of once per page, and the
 * notice a finished purchase produces survives the page change that follows it.
 */
export function WalletScreen({ signedIn, onSignIn, onClose }: {
  signedIn: boolean; onSignIn(): void; onClose(): void;
}) {
  const { wallet, store } = useVibes();
  const buy = useWalletPurchase(signedIn);
  // Resolved above both pages: Reduce Motion resolves asynchronously and reads as
  // "reduce" until it does, so anything that remounts must be handed the answer.
  const still = useReducedMotion();
  // Counted here for the same reason purchasing is held here: a purchase made on
  // the upgrade page changes the balance while the figure that shows it is not
  // mounted, so a counter living on that figure would only ever open at the answer.
  const shown = useCountUp(wallet?.available ?? 0, still);
  const [upgrading, setUpgrading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => void (async () => {
    setRefreshing(true);
    try { await store.refresh(); } finally { setRefreshing(false); }
  })();
  // A finished purchase belongs on the page with the balance on it: you watch the
  // Vibes you just bought arrive rather than reading that they did.
  useEffect(() => { if (buy.notice?.ok) setUpgrading(false); }, [buy.notice]);
  // Every hook above runs whatever the account is, so signing in changes the page
  // without changing how many hooks this render made.
  if (!signedIn) return <SignedOutPage onSignIn={onSignIn} onClose={onClose} />;
  // Buying the top plan empties the offers, so the page that was showing them has
  // nothing left to show. It is not somewhere an account can be stranded.
  return upgrading && buy.offers.length > 0
    ? <UpgradePage buy={buy} wallet={wallet} still={still} refreshing={refreshing}
      onRefresh={refresh} onBack={() => setUpgrading(false)} onClose={onClose} />
    : <BalancePage buy={buy} shown={shown} refreshing={refreshing}
      onRefresh={refresh} onUpgrade={() => setUpgrading(true)} onClose={onClose} />;
}
