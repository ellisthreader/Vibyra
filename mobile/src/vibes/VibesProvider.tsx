import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { PurchaseBridge, VibesApi } from './types';
import { purchaseBridge } from './purchaseBridge';
import { claimPending } from './purchases';
import { VibesStore } from './VibesStore';

const Context = createContext<VibesStore | null>(null);
function accountStore(api: VibesApi, identity: string | null, purchases: PurchaseBridge | null) {
  const key = `vibes.${encodeURIComponent(identity ?? 'guest')}`;
  return new VibesStore(api, randomUUID, { read: () => readFlag(key), write: value => writeFlag(key, value) }, purchases);
}
export function VibesProvider({ api, identity, children, purchases = purchaseBridge }: { api: VibesApi; identity: string | null; children: ReactNode; purchases?: PurchaseBridge | null }) {
  // Each account keeps its own wallet, chats and pending purchases. The store is replaced in place rather
  // than remounted: keying this subtree by identity restarted the workspace below, so signing in or up
  // during the first run threw the phone back to the welcome screen.
  const [account, setAccount] = useState(() => ({ identity, store: accountStore(api, identity, purchases) }));
  if (account.identity !== identity) setAccount({ identity, store: accountStore(api, identity, purchases) });
  const store = account.store;
  // The picker must fill even before an account exists, so the catalogue load is
  // not part of the signed-in lifecycle below.
  useEffect(() => { void store.loadModels(); }, [store]);
  useEffect(() => {
    if (!identity) return;
    const recoverPurchases = async () => {
      if (!purchases || !store.state.wallet) return;
      try { store.update({ wallet: await claimPending(api, purchases, false) }); } catch (e) { store.error(e); }
    };
    void store.initialize().then(recoverPurchases);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && store.state.pending) void store.refresh();
    }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void store.refresh().then(recoverPurchases); });
    const transactionListener = purchases?.addListener?.('transactionsChanged', () => { void recoverPurchases(); });
    return () => { clearInterval(timer); listener.remove(); transactionListener?.remove(); };
  }, [store, identity]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useVibes() {
  const store = useContext(Context);
  if (!store) throw new Error('VibesProvider is missing');
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return { store, ...state };
}
