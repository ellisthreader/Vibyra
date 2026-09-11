import { useEffect, useMemo, useRef, useState } from 'react';
import { useVibes } from './VibesProvider';
import { buyVibes, claimPending } from './purchases';
import { defaultOffer, offers } from './plans';
import type { StoreProduct, VibesProduct } from './types';

/** A finished purchase or a failure, told apart so the page can say which it was. */
export interface Notice { text: string; ok: boolean }
export interface WalletPurchase {
  offers: VibesProduct[]; selected: string | null; plan: VibesProduct | null;
  price?: string; priceOf(id: string): string | undefined;
  current: VibesProduct | undefined; topups: VibesProduct[];
  bridge: boolean; canBuy: boolean; busy: boolean; notice: Notice | null;
  choose(plan: string | null): void; buy(id: string): void; restore(): void;
}

/**
 * Pricing and purchase for the upgrade page. It lives outside the screen so the
 * page file stays presentation, and so the picker's one rule — it follows the
 * account, and a completed purchase re-defaults it — has a single home.
 */
export function useWalletPurchase(active: boolean): WalletPurchase {
  const { wallet, store, ready } = useVibes();
  const bridge = store.purchases;
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    setNotice(null); void store.refresh();
    if (bridge && wallet) void bridge.products(wallet.products.map(p => p.id))
      .then(p => { if (live) setProducts(p); })
      .catch(() => { if (live) setNotice({ text: 'Apple prices could not be loaded. Please try again.', ok: false }); });
    return () => { live = false; };
  }, [active, store, wallet?.accountToken]);
  const available = useMemo(() => offers(wallet), [wallet]);
  const selected = available.some(p => p.plan === chosen) ? chosen : defaultOffer(available);
  const plan = available.find(p => p.plan === selected) ?? null;
  const priceOf = (id: string) => products.find(p => p.id === id)?.displayPrice;
  const guarded = async (work: () => Promise<string>) => {
    if (!bridge || lock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try { const text = await work(); setNotice(text ? { text, ok: true } : null); }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : 'Purchase could not complete.', ok: false }); }
    finally { lock.current = false; setBusy(false); }
  };
  return {
    offers: available, selected, plan, price: plan ? priceOf(plan.id) : undefined, priceOf,
    current: wallet?.products.find(p => p.kind === 'subscription' && p.plan === wallet.plan),
    topups: wallet && wallet.plan !== 'free' ? wallet.products.filter(p => p.kind === 'topup') : [],
    bridge: Boolean(bridge), busy, notice,
    canBuy: Boolean(ready && bridge && wallet?.purchasesEnabled),
    choose: setChosen,
    buy: id => void guarded(async () => {
      const next = await buyVibes(store.api, bridge!, id, wallet!);
      if (!next) return '';
      store.update({ wallet: next });
      return 'Your Vibes are ready. Return to your chat whenever you like.';
    }),
    restore: () => void guarded(async () => {
      store.update({ wallet: await claimPending(store.api, bridge!, true) });
      return 'Your purchases and balance are up to date.';
    }),
  };
}
