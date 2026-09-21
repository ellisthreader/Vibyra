import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SettingsPageProps } from '../settings/pages';
import { useTheme } from '../theme';
import { AccountSheet } from '../ui/AccountSheet';
import { useCountUp } from '../ui/motion';
import { useSheetBottomInset } from '../ui/OverlaySheet';
import { Button, Hint } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { SignedOutBody } from './SignedOutPage';
import { UsageLimits } from './UsageLimits';
import { useVibes } from './VibesProvider';
import { WalletBalance } from './WalletBalance';
import { walletHeadline } from './walletHeadline';
import { useWalletPurchase } from './useWalletPurchase';

// The balance this page last drew, and what the upgrade page handed back with a
// finished purchase. The upgrade page is a destination of its own, so the purchase
// finishes while this page is not mounted: without these it would open at the new
// total, counting nothing, with the notice left behind on a page that has closed.
let seen: number | null = null;
let handed: string | null = null;
/** Called by the upgrade page just before a finished purchase returns here. */
export const handBack = (notice: string) => { handed = notice; };

/**
 * Vibyra tokens, the Settings page the balance lives on (briefly "Plan & Vibes"). It
 * was a destination with a rail row of its own until it was judged not to need a
 * whole tab: how much you have is now the coin and number at the foot of the rail,
 * and this is the page they and the Settings row open.
 *
 * It is the balance page as it was last approved, moved rather than redesigned:
 * the figure, centred, the two windows with when each resets, and the two ways to
 * have more at the bottom of the sheet. No footnote and no store links — the page was
 * asked to be as simple as it could be, and the links sit beside the subscription
 * on the upgrade page. The sheet draws the title and Back, so the page is only its
 * scroll.
 */
export function VibesSettingsPage({ workspace, nav, routes, onSignIn }: SettingsPageProps & {
  // Whoever mounts the page may own signing in; by default it raises its own sheet.
  onSignIn?: () => void;
}) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const { wallet, error } = useVibes();
  const signedIn = Boolean(workspace.account);
  const buy = useWalletPurchase(signedIn);
  const still = useReducedMotion();
  const headline = wallet ? walletHeadline(wallet) : null;
  const available = headline?.figure ?? 0;
  // Starts from the last balance drawn here and moves to this one, so Vibes bought
  // on the upgrade page are watched arriving rather than read about.
  const [target, setTarget] = useState(seen ?? available);
  useEffect(() => { setTarget(available); if (wallet) seen = available; }, [available, wallet]);
  const shown = useCountUp(target, still);
  const [arrived] = useState(() => { const text = handed; handed = null; return text; });
  const notice = buy.notice ?? (arrived ? { text: arrived, ok: true } : null);
  const [signIn, setSignIn] = useState(false);
  const askSignIn = onSignIn ?? (() => setSignIn(true));
  const canUpgrade = signedIn && buy.offers.length > 0;
  const sheet = onSignIn ? null : <AccountSheet visible={signIn} workspace={workspace} onClose={() => setSignIn(false)} />;
  // Signed out with no guest wallet, there is no figure to draw and nothing to buy:
  // one thing to say and one thing to do, never a "—" balance or a red error.
  if (!signedIn && !wallet) return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
    <SignedOutBody onSignIn={askSignIn} />
    {sheet}
  </ScrollView>;
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]} keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}>
    <WalletBalance wallet={wallet} shown={shown} headline={headline} />
    {wallet?.limits && <UsageLimits limits={wallet.limits} />}
    {error && <Hint error>{error}</Hint>}
    {!wallet && <Hint>Your balance is on its way.</Hint>}
    {/* Pushed to the foot of the sheet, so the figures are read first and the
        actions wait where a thumb already is. Upgrading leads; the top-up follows,
        and is the filled action only once there is no plan left to sell. */}
    <View style={s.actions}>
      {notice ? <Text accessibilityRole="alert" style={[s.notice,
        { color: notice.ok ? colors.text : colors.error }]}>{notice.text}</Text> : null}
      {canUpgrade && <Button title="Upgrade your plan" onPress={() => nav.close(() => routes.wallet('vibes'))} />}
      {buy.topups.map(topup => {
        const price = buy.priceOf(topup.id);
        return <Button key={topup.id} secondary={canUpgrade} icon="add"
          title={price ? `Add ${topup.credits} Vibes · ${price}` : 'Extra Vibes unavailable'}
          disabled={!price || !buy.canBuy || buy.busy} onPress={() => buy.buy(topup.id)} />;
      })}
      {/* A guest holds trial Vibes but cannot buy more, so the one thing to offer is
          the account that can. */}
      {!signedIn && <Button title="Sign in to get more Vibes" onPress={askSignIn} />}
    </View>
    {sheet}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, gap: 24 },
  actions: { marginTop: 'auto', paddingTop: 12, gap: 10 },
  notice: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
