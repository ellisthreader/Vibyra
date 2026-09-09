import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Sheet } from '../ui/Sheet';
import { Button, Hint } from '../ui/primitives';
import { useVibes } from './VibesProvider';
import { buyVibes, claimPending } from './purchases';
import { PlanBenefits } from './PlanBenefits';
import { PlanCard } from './PlanCard';
import { WalletBalance } from './WalletBalance';
import { benefitsFor, defaultOffer, offers, planNames } from './plans';
import type { StoreProduct } from './types';

export function WalletSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { colors } = useTheme();
  const { wallet, store, ready } = useVibes();
  const purchaseBridge = store.purchases;
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const purchaseLock = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setNotice(null); void store.refresh();
    if (purchaseBridge && wallet) void purchaseBridge.products(wallet.products.map(p => p.id))
      .then(p => { if (live) setProducts(p); }).catch(() => { if (live) setNotice('Apple prices could not be loaded. Please try again.'); });
    return () => { live = false; };
  }, [visible, store, wallet?.accountToken]);
  const available = useMemo(() => offers(wallet), [wallet]);
  // The picker follows the account: a purchase removes an offer and re-defaults.
  const selected = available.some(p => p.plan === chosen) ? chosen : defaultOffer(available);
  const plan = available.find(p => p.plan === selected);
  const priceOf = (id: string) => products.find(p => p.id === id)?.displayPrice;
  const price = plan ? priceOf(plan.id) : undefined;
  const purchase = async (id: string) => {
    if (!purchaseBridge || !wallet || purchaseLock.current) return;
    purchaseLock.current = true; setBusy(true); setNotice(null);
    try {
      const next = await buyVibes(store.api, purchaseBridge, id, wallet);
      if (next) { store.update({ wallet: next }); setNotice('Your Vibes are ready. Return to your chat whenever you like.'); }
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Purchase could not complete.'); }
    finally { purchaseLock.current = false; setBusy(false); }
  };
  const restore = async () => {
    if (!purchaseBridge || purchaseLock.current) return;
    purchaseLock.current = true; setBusy(true); setNotice(null);
    try { store.update({ wallet: await claimPending(store.api, purchaseBridge, true) }); setNotice('Your purchases and balance are up to date.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Restore could not complete.'); }
    finally { purchaseLock.current = false; setBusy(false); }
  };
  const current = wallet?.products.find(p => p.kind === 'subscription' && p.plan === wallet.plan);
  return <Sheet title="Your Vibes" visible={visible} onClose={onClose}>
    <WalletBalance wallet={wallet} />
    {wallet && plan ? <>
      <View style={s.intro}>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Keep your ideas moving.</Text>
        <Text style={[s.detail, { color: colors.muted }]}>More Vibes every month, more projects at once, and the AI models you want.</Text>
      </View>
      <View style={s.plans}>{available.map(p => <PlanCard key={p.id} product={p} wallet={wallet} price={priceOf(p.id)}
        selected={p.plan === selected} disabled={busy} onPress={() => setChosen(p.plan)} />)}</View>
      <PlanBenefits title={`What ${planNames[plan.plan ?? ''] ?? 'this plan'} includes`} benefits={benefitsFor(plan, wallet)} />
      <Button title={price ? `Continue · ${price} / month` : 'Purchases unavailable'} busy={busy}
        disabled={!ready || !wallet.purchasesEnabled || !price || !purchaseBridge} onPress={() => void purchase(plan.id)} />
    </> : wallet && current ? <>
      <PlanBenefits title="Your plan includes" benefits={benefitsFor(current, wallet)} />
      <Hint>You are on the highest plan. Add Vibes below whenever you need more.</Hint>
    </> : null}
    {!purchaseBridge && <Hint>Purchases are available in the installed iPhone app. Your balance stays with your account.</Hint>}
    {notice && <Text accessibilityRole="alert" style={[s.detail, { color: colors.text }]}>{notice}</Text>}
    {wallet && wallet.plan !== 'free' && wallet.products.filter(p => p.kind === 'topup').map(p => {
      const topupPrice = priceOf(p.id);
      return <Button key={p.id} secondary title={topupPrice ? `Add ${p.credits} Vibes · ${topupPrice}` : 'Extra Vibes unavailable'}
        disabled={!topupPrice || !wallet.purchasesEnabled || busy} onPress={() => void purchase(p.id)} />;
    })}
    <Text style={[s.terms, { color: colors.muted }]}>Subscriptions renew automatically until cancelled. Plan upgrades add the allowance difference for the current period. AI usage varies by model and task. Your purchased Vibes do not expire.</Text>
    <View style={s.links}>
      <Pressable accessibilityRole="button" disabled={!purchaseBridge || busy} onPress={() => void restore()} style={s.link}><Text style={{ color: colors.accent }}>Restore Purchases</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://apps.apple.com/account/subscriptions')} style={s.link}><Text style={{ color: colors.accent }}>Manage subscription</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} style={s.link}><Text style={{ color: colors.muted }}>Terms</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://vibyra.app/privacy')} style={s.link}><Text style={{ color: colors.muted }}>Privacy</Text></Pressable>
    </View>
  </Sheet>;
}
const s = StyleSheet.create({
  detail: { fontSize: 14, lineHeight: 21 }, intro: { gap: 7 },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.6 }, plans: { gap: 10 },
  terms: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18 }, link: { minHeight: 44, justifyContent: 'center' },
});
