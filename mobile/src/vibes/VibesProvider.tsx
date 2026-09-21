import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { PurchaseBridge, VibesApi } from './types';
import { purchaseBridge } from './purchaseBridge';
import { claimPending } from './purchases';
import { VibesStore } from './VibesStore';
import { prepareGuest, renewGuest } from './guestSession';
import { vibesStateKey } from './guestKeys';

const Context = createContext<VibesStore | null>(null);
export const VibesStoreProvider = Context.Provider;
function accountStore(api: VibesApi, identity: string | null, guest: boolean, purchases: PurchaseBridge | null) {
  const key = vibesStateKey(identity);
  const prepare = !identity && guest ? () => prepareGuest(api).then(() => {}) : undefined;
  return new VibesStore(api, randomUUID, { read: () => readFlag(key), write: value => writeFlag(key, value) }, purchases, prepare);
}
export function VibesProvider({ api, identity, guest = false, children, onMembershipChange, purchases = purchaseBridge }: {
  api: VibesApi; identity: string | null; guest?: boolean; children: ReactNode; purchases?: PurchaseBridge | null; onMembershipChange?(): void;
}) {
  // Each account keeps its own wallet, chats and pending purchases. The store is replaced in place rather
  // than remounted: keying this subtree by identity restarted the workspace below, so signing in or up
  // during the first run threw the phone back to the welcome screen.
  const [account, setAccount] = useState(() => ({ identity, guest, store: accountStore(api, identity, guest, purchases) }));
  if (account.identity !== identity || account.guest !== guest) {
    setAccount({ identity, guest, store: accountStore(api, identity, guest, purchases) });
  }
  const store = account.store;
  const membershipChanged = useRef(onMembershipChange);
  membershipChanged.current = onMembershipChange;
  useEffect(() => {
    let previous = '';
    return store.subscribe(() => {
      const wallet = store.state.wallet;
      if (!wallet || !identity) return;
      const key = `${wallet.plan}:${wallet.paidUntil}`;
      if (key !== previous) { previous = key; membershipChanged.current?.(); }
    });
  }, [store, identity]);
  // The picker must fill even before an account exists, so the catalogue load is
  // not part of the signed-in lifecycle below.
  useEffect(() => { void store.loadModels(); }, [store]);
  useEffect(() => {
    if (!identity && (!guest || !api.guest)) return;
    let active = true;
    const recoverPurchases = async () => {
      if (!identity || !purchases || !store.state.wallet) return;
      try { store.update({ wallet: await claimPending(api, purchases, false) }); } catch (e) { store.error(e); }
    };
    const start = async () => {
      if (identity) api.guest?.restore(null);
      if (!active) return;
      await store.initialize();
      // A restored guest token can expire. Replace it only after an authoritative
      // rejection; a timeout keeps the same identity and the same pending sends.
      // A renewed guest is a new row on the server: nothing the old one had open is its to reopen.
      if (!identity && guest && store.state.errorStatus === 401 && await renewGuest(api)) { await store.forgetChat(); await store.refresh(); }
      if (active) await recoverPurchases();
    };
    void start().catch(error => { if (active) store.error(error); });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && store.needsPolling) void store.refresh();
    }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void store.refresh().then(recoverPurchases); });
    const transactionListener = purchases?.addListener?.('transactionsChanged', () => { void recoverPurchases(); });
    return () => { active = false; clearInterval(timer); listener.remove(); transactionListener?.remove(); };
  }, [store, identity, guest]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useVibes() {
  const store = useVibesStore();
  if (!store) throw new Error('VibesProvider is missing');
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return { store, ...state };
}
// The store on its own, without subscribing. A caller that only starts a new chat
// must not re-render the whole app every time the wallet or a turn changes.
export function useVibesStore() { return useContext(Context); }
const never = () => () => {};
// Which chat is open and where each one lives, for the screens that route by
// chat rather than draw it. Null where no provider is mounted, as in a fixture
// without the phone chat.
export function useVibesChats() {
  const store = useVibesStore();
  const state = useSyncExternalStore(store?.subscribe ?? never, store?.snapshot ?? (() => null), store?.snapshot ?? (() => null));
  return { chats: state?.chats ?? [], selected: state?.selected ?? null };
}
