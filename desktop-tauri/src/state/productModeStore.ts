import { create } from 'zustand';
import { useAccountStore } from './accountStore';
export type ProductMode = 'work' | 'agent';
function key() { return `product-mode.${encodeURIComponent(useAccountStore.getState().snapshot.profile?.email ?? 'guest')}`; }
function read(): ProductMode { try { return localStorage.getItem(key()) === 'agent' ? 'agent' : 'work'; } catch { return 'work'; } }
export const useProductMode = create<{ mode: ProductMode; choose(mode: ProductMode): void }>(set => ({
  mode: read(), choose: mode => { set({ mode }); try { localStorage.setItem(key(), mode); } catch { /* This window retains selection. */ } },
}));
useAccountStore.subscribe((state, previous) => {
  if (state.snapshot.profile?.email !== previous.snapshot.profile?.email) useProductMode.setState({ mode: read() });
});
