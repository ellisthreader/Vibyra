import { useEffect, useMemo, useRef, useState } from 'react';
import { useVibes } from './VibesProvider';
import { buyVibes, claimPending } from './purchases';
import { defaultOffer, offers, sizesOf } from './plans';
import type { StoreProduct, VibesProduct } from './types';

/** A finished purchase or a failure, told apart so the page can say which it was. */
export interface Notice { text: string; ok: boolean; upgrade?: import('./UpgradeCelebration').UpgradeSuccess }
export interface WalletPurchase {
  offers: VibesProduct[]; sizes: VibesProduct[]; plan: VibesProduct | null;
  price?: string; priceOf(id: string): string | undefined;
  current: VibesProduct | undefined; topups: VibesProduct[];
  bridge: boolean; canBuy: boolean; busy: boolean; notice: Notice | null;
  choose(plan: string | null): void; buy(id: string): void; restore(): void; reloadPrices(): void;
}

/**
 * Pricing and purchase for the upgrade page. It lives outside the screen so the
 * page file stays presentation, and so the rule about what is sold has one home:
 * the sizes of Pro above the account's own, opening on the top one, and a chosen
 * size that is no longer on sale (bought, or moved past) falls back to the top.
 */
export function useWalletPurchase(active: boolean): WalletPurchase {
  const { wallet, store, ready } = useVibes();
  const bridge = store.purchases;
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [priceAttempt, setPriceAttempt] = useState(0);
  const lock = useRef(false);
  const productIds = JSON.stringify(wallet?.products.map(p => p.id) ?? []);
  useEffect(() => {
    if (!active) return;
    setNotice(null); void store.refresh();
  }, [active, store]);
  useEffect(() => {
    setProducts([]);
    if (!active || !bridge || !wallet) return;
    let live = true;
    setNotice(null);
    void bridge.products(JSON.parse(productIds) as string[])
      .then(p => { if (live) setProducts(p); })
      .catch(() => { if (live) setNotice({ text: 'Apple prices could not be loaded. Please try again.', ok: false }); });
    return () => { live = false; };
  }, [active, bridge, store, wallet?.accountToken, productIds, priceAttempt]);
  const available = useMemo(() => offers(wallet), [wallet]);
  const sizes = useMemo(() => sizesOf(available), [available]);
  const selling = sizes.length ? sizes : available;
  const plan = selling.find(p => p.plan === chosen) ?? selling.find(p => p.plan === defaultOffer(selling)) ?? null;
  const priceOf = (id: string) => products.find(p => p.id === id)?.displayPrice;
  const guarded = async (work: () => Promise<string | Notice>) => {
    if (!bridge || lock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try { const text = await work(); setNotice(typeof text === 'string' ? (text ? { text, ok: true } : null) : text); }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Purchase could not complete.', ok: false }); }
    finally { lock.current = false; setBusy(false); }
  };
  return {
    offers: available, sizes, plan, price: plan ? priceOf(plan.id) : undefined, priceOf,
    current: wallet?.products.find(p => p.kind === 'subscription' && p.plan === wallet.plan),
    topups: wallet && wallet.plan !== 'free' ? wallet.products.filter(p => p.kind === 'topup') : [],
    bridge: Boolean(bridge), busy, notice, choose: setChosen, reloadPrices: () => setPriceAttempt(n => n + 1),
    canBuy: Boolean(ready && bridge && wallet?.purchasesEnabled),
    buy: id => void guarded(async () => {
      if (!active || !ready || !wallet || !priceOf(id)) throw new Error('Apple prices are not ready. Refresh and try again.');
      const next = await buyVibes(store.api, bridge!, id, wallet!);
      if (!next) return '';
      store.update({ wallet: next });
      return { text: 'Your Vibes and Pro features are ready.', ok: true,
        upgrade: wallet.products.find(p => p.id === id)?.kind === 'subscription' && next.plan !== 'free'
          ? { plan: next.plan, added: Math.max(0, next.total - wallet.total), balance: next.available } : undefined };
    }),
    restore: () => void guarded(async () => {
      store.update({ wallet: await claimPending(store.api, bridge!, true) });
      return 'Your purchases and balance are up to date.';
    }),
  };
}
