import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { useVibes } from './VibesProvider';
import { UsageLimits } from './UsageLimits';
import { WalletBalance } from './WalletBalance';
import { WalletLinks, WalletPage } from './WalletChrome';
import type { WalletPurchase } from './useWalletPurchase';

/**
 * Your Vibes. What this account has, how fast it may spend it, and the two ways
 * to have more. Nothing else.
 *
 * No plan is sold here. Plans are a page of their own, one button away, because a
 * balance and a price list answer different questions and the balance was losing —
 * this page was headed "Get Vibyra Pro" even for accounts already paying for Pro.
 *
 * It carried two prose blocks under that: what the plan included, and three rules
 * about how the economy worked. Both are gone. A balance page is read to answer
 * "can I send now?", and neither block answered it — the entitlement list belongs
 * on the page that sells the entitlement, and rules that never change are not news
 * every time someone checks a number. What replaced them, `UsageLimits`, is the
 * half of that question the figure alone stopped answering the moment a rate
 * existed that a full wallet could still meet.
 *
 * Both ways to have more are buttons rather than sections. Upgrading leads, since
 * it is the one that changes every month; the top-up follows it and only becomes
 * the filled action when there is no plan left to sell.
 */
export function BalancePage({ buy, shown, refreshing, onRefresh, onUpgrade, onClose }: {
  buy: WalletPurchase; shown: number; refreshing: boolean;
  onRefresh(): void; onUpgrade(): void; onClose(): void;
}) {
  const { colors } = useTheme();
  const { wallet, error } = useVibes();
  const canUpgrade = buy.offers.length > 0;
  return <WalletPage title="Your Vibes" onClose={onClose} refreshing={refreshing} onRefresh={onRefresh}>
    <WalletBalance wallet={wallet} shown={shown} />
    {/* Directly under the figure, because it is the same question: the balance says
        how much is left, these say how much of it may be spent now. Both windows
        are drawn whenever the backend publishes them, so the rate the plan is sold
        on is readable before a send is refused rather than only after. */}
    {wallet?.limits && <UsageLimits limits={wallet.limits} />}
    <View style={s.actions}>
      {canUpgrade && <Button title="Upgrade your plan" onPress={onUpgrade} />}
      {/* The one purchase that outlives every plan: it lands in the figure above
          it rather than changing what the account is subscribed to. */}
      {buy.topups.map(topup => {
        const price = buy.priceOf(topup.id);
        return <Button key={topup.id} secondary={canUpgrade} icon="add"
          title={price ? `Add ${topup.credits} Vibes · ${price}` : 'Extra Vibes unavailable'}
          disabled={!price || !buy.canBuy || buy.busy} onPress={() => buy.buy(topup.id)} />;
      })}
    </View>
    {error && <Hint error>{error}</Hint>}
    {!wallet && <Hint>Your balance is on its way. Pull down to try again.</Hint>}
    {/* Where a finished purchase is reported, including one made on the upgrade
        page: it hands you back here so you watch the Vibes arrive. */}
    {buy.notice ? <Text accessibilityRole="alert" style={[s.notice,
      { color: buy.notice.ok ? colors.text : colors.error }]}>{buy.notice.text}</Text> : null}
    {!buy.bridge && <Hint>Purchases are available in the installed iPhone app. Your balance stays with your account.</Hint>}
    {/* The one thing the figures above cannot say: what a Vibe is. One sentence,
        and the only sentence left on the page. The three-rule "How Vibes work"
        block it replaced was the clutter, not the explaining — but a page of bare
        numbers reads as something the reader is expected to already understand,
        which is the other way to be unreadable. It was two sentences until the
        second one ("you see the most it can use before you send") was cut as the
        wordiest thing left on a page asked to lose words. */}
    <Text style={[s.footnote, { color: colors.muted }]}>A reply costs what the model costs.</Text>
    <WalletLinks onRestore={buy.restore} disabled={!buy.bridge || buy.busy} />
  </WalletPage>;
}
const s = StyleSheet.create({
  actions: { gap: 10 },
  notice: { fontSize: 14, lineHeight: 21 },
  footnote: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: -8 },
});
