import { useSyncExternalStore } from 'react';
import { useVibesStore } from '../vibes/VibesProvider';

const idle = () => () => {};
const nothing = () => null;

/**
 * The Vibes wallet if one has loaded, for a row that only shows it. Unlike
 * `useVibes()` it does not insist on a provider: a sheet drawn without the Vibes
 * area simply shows the plan without a balance. A missing wallet means "not
 * loaded", never "signed out" — the account decides that.
 */
export function useWallet() {
  const store = useVibesStore();
  const state = useSyncExternalStore(store ? store.subscribe : idle, store ? store.snapshot : nothing, store ? store.snapshot : nothing);
  return state?.wallet ?? null;
}
