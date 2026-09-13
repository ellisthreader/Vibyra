import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { Bullets } from './Bullets';
import { UsageOptions } from './UsageOptions';
import { WalletLinks, WalletPage } from './WalletChrome';
import { benefitsFor, planNames } from './plans';
import type { WalletPurchase } from './useWalletPurchase';
import type { VibesWallet } from './types';

/**
 * Choosing a bigger monthly allowance, as its own page rather than as the lower
 * half of the balance. Nothing here is about what the account holds today except
 * the one line that says so — with the balance a page away, the plans would
 * otherwise be priced against nothing.
 *
 * The price, what it gives you and the button that buys it are one block, in that
 * order, with the renewal terms under the button. Those terms used to be pinned to
 * the bottom of the balance page, where they promised a monthly renewal to accounts
 * whose only remaining purchase was a one-off top-up.
 *
 * A finished purchase is not reported here. It hands the page back to the balance,
 * which is where the Vibes just bought can actually be seen arriving.
 */
export function UpgradePage({ buy, wallet, still, refreshing, onRefresh, onBack, onClose }: {
  buy: WalletPurchase; wallet: VibesWallet | null; still: boolean; refreshing: boolean;
  onRefresh(): void; onBack(): void; onClose(): void;
}) {
  const { colors } = useTheme();
  const offer = buy.plan;
  const name = offer ? planNames[offer.plan ?? ''] ?? offer.plan ?? '' : '';
  return <WalletPage title="Upgrade" onBack={onBack} onClose={onClose} refreshing={refreshing} onRefresh={onRefresh}>
    <View style={s.intro}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Get more each month</Text>
      {wallet && <Text style={[s.standing, { color: colors.muted }]}>You are on the {planNames[wallet.plan]
        ?? wallet.plan} plan with {wallet.available.toLocaleString()} Vibes.</Text>}
    </View>
    <UsageOptions offers={buy.offers} selected={buy.selected} priceOf={buy.priceOf}
      disabled={buy.busy} onSelect={buy.choose} />
    {/* Keyed on the plan: remounting is what animates a switch of usage, and it
        makes one plan's lines under another plan's price impossible. */}
    {wallet && offer && <Bullets key={offer.id} still={still} title={`What ${name} gives you`}
      lines={benefitsFor(offer, wallet).map(b => b.status ? `${b.label} — ${b.status.toLowerCase()}` : b.label)} />}
    {buy.notice && !buy.notice.ok ? <Text accessibilityRole="alert"
      style={[s.notice, { color: colors.error }]}>{buy.notice.text}</Text> : null}
    {offer && <Button busy={buy.busy} disabled={!buy.canBuy || !buy.price} onPress={() => buy.buy(offer.id)}
      title={buy.price ? `Upgrade to ${name} · ${buy.price}` : 'Purchases unavailable'} />}
    <Text style={[s.terms, { color: colors.muted }]}>Renews automatically each month. Cancel any time in the App
      Store. How far Vibes go depends on the model and the task.</Text>
    {!buy.bridge && <Hint>Purchases are available in the installed iPhone app. Your balance stays with your account.</Hint>}
    <WalletLinks onRestore={buy.restore} disabled={!buy.bridge || buy.busy} />
  </WalletPage>;
}
const s = StyleSheet.create({
  intro: { gap: 6, paddingTop: 2 },
  title: { fontSize: 27, fontWeight: '600', letterSpacing: -0.8 },
  standing: { fontSize: 14, lineHeight: 21 },
  notice: { fontSize: 14, lineHeight: 21 },
  terms: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: -12 },
});
