import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { useAppear } from '../ui/motion';
import { Button } from '../ui/primitives';
import { Bullets } from './Bullets';
import { PlanTabs } from './PlanTabs';
import { PlanPurchaseButton } from './PlanPurchaseButton';
import { WalletLinks, WalletPage } from './WalletChrome';
import { benefitsFor, planNames, planSizes } from './plans';
import type { WalletPurchase } from './useWalletPurchase';
import type { VibesWallet } from './types';

// The membership's own mark: a cartoon cobalt gem, the symbol other apps' premium
// tiers have taught people to read as "Pro". Generated with the ChatGPT (Codex)
// CLI; it carries its own alpha, so one image sits on both palettes.
const art = require('../../assets/vibyra-pro.png');
const artRatio = 649 / 768;

/**
 * The paywall, and only the paywall: the mark, "Get Vibyra Pro", one line saying
 * who it is for, the size switch, what it gives you, and the purchase. Nothing else.
 *
 * It sells Pro in two sizes, "10×" and "20×" (the Builder and Pro products), opening
 * on the top one. The sizes differ only in Vibes, so switching changes the figures
 * and the price and nothing else: the figures roll to their new value, and every
 * other line stays where it was. The switch only appears while there are two sizes
 * to choose between — an account already on Pro 10× sees Pro 20× alone. The three
 * priced cards, the line saying where the account stood and two sentences of terms
 * were cut when the page was reported as more than it needed to be. An account
 * already on the top plan never arrives here.
 *
 * The purchase is the page's footer, pinned to the bottom of the screen with
 * "Renews automatically." under it — the one disclosure Apple needs beside a
 * subscription's price, alongside the Restore, Terms and Privacy links.
 *
 * A verified subscription opens the success celebration before returning to the balance.
 */
export function UpgradePage({ buy, wallet, still, refreshing, onRefresh, onBack, onClose, onPreview }: {
  buy: WalletPurchase; wallet: VibesWallet | null; still: boolean; refreshing: boolean;
  onRefresh(): void; onBack(): void; onClose(): void; onPreview?(): void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  // Opening the page is the tap this answers, so the mark settles in once.
  const appear = useAppear(still);
  const offer = buy.plan;
  const name = offer ? planNames[offer.plan ?? ''] ?? offer.plan ?? '' : '';
  // The headline and the list name the membership, not the size: both sizes are
  // Pro, with everything the same but the Vibes, so switching changes only figures.
  const family = offer && planSizes[offer.plan ?? ''] ? 'Pro' : name;
  // Keep allowance rows stable across size changes. benefitsFor only includes
  // capabilities that can be delivered now; this page sells the current plan.
  const items = wallet && offer ? benefitsFor(offer, wallet).map(b =>
    ({ key: b.amount === undefined ? `${b.id}:${b.label}` : b.id, text: b.label, amount: b.amount, unit: b.unit })) : null;
  // Sized from the screen so a small phone keeps the purchase and every line in view.
  // Kept an accent over the headline rather than the page's biggest thing. A phone
  // under 720pt tall (the SE) has no spare height at all, so there the mark and the
  // gaps step down rather than pushing the last line under the button.
  const short = height < 720;
  const width = short ? (__DEV__ && onPreview ? 36 : 64) : Math.round(Math.min(136, Math.max(92, height * 0.14)));
  const footer = <>
    {buy.notice && !buy.notice.ok ? <Text accessibilityRole="alert"
      style={[s.notice, { color: colors.error }]}>{buy.notice.text}</Text> : null}
    {buy.bridge && !buy.price && buy.notice?.ok === false &&
      <Button title="Retry Apple prices" onPress={buy.reloadPrices} disabled={buy.busy} />}
    {offer && <PlanPurchaseButton still={still} busy={buy.busy} disabled={!buy.canBuy || !buy.price} onPress={() => buy.buy(offer.id)}
      title={buy.price ? `Get ${name} · ${buy.price} a month` : 'Purchases unavailable'} />}
    <Text style={[s.terms, { color: colors.muted }]}>
      {buy.bridge ? 'Billed through your Apple Account. Renews monthly until cancelled.' : 'Available in the installed iPhone app.'}</Text>
    <WalletLinks onRestore={buy.restore} disabled={!buy.bridge || buy.busy} />
    {__DEV__ && onPreview && <Pressable accessibilityRole="button" accessibilityLabel="Test Pro upgrade"
      onPress={onPreview} disabled={buy.busy || !offer} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={[s.terms, { color: colors.muted, textDecorationLine: 'underline' }]}>Test Pro upgrade</Text>
    </Pressable>}
  </>;
  return <WalletPage centred onBack={onBack} onClose={onClose} refreshing={refreshing} onRefresh={onRefresh}
    footer={footer}>
    <View style={s.hero}>
      <Animated.Image testID="pro-art" source={art} accessible={false} resizeMode="contain"
        style={{ width, height: Math.round(width * artRatio), opacity: appear,
          transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }} />
      <Text accessibilityRole="header" style={[s.title, short && s.titleShort, { color: colors.text }]}>
        Get Vibyra {family}</Text>
      <Text style={[s.lead, { color: colors.muted }]}>All your Pro features. More Vibes to use them.</Text>
      {buy.sizes.length > 1 && <View style={[s.tabs, short && s.tabsShort]}><PlanTabs sizes={buy.sizes} selected={offer?.plan ?? null}
        still={still} disabled={buy.busy} onSelect={buy.choose} /></View>}
    </View>
    {items && <Bullets still={still} dense={short} title={`What ${family} gives you`} items={items} />}
  </WalletPage>;
}
const s = StyleSheet.create({
  hero: { alignItems: 'center' },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.9, textAlign: 'center', marginTop: 16 },
  lead: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  titleShort: { marginTop: 10 },
  tabs: { alignSelf: 'stretch', marginTop: 20 }, tabsShort: { marginTop: 10 },
  notice: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  terms: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
