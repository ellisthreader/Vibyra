import { useSyncExternalStore } from 'react';
import { useVibesStore } from './VibesProvider';
import type { VibesEntitlements } from './types';

const never = () => () => {};
const none = () => null;

/** This account's plan limits from the wallet, or null before it has loaded. */
export function usePlanEntitlements(): VibesEntitlements | null {
  const store = useVibesStore();
  return useSyncExternalStore(
    store?.subscribe ?? never,
    () => store?.snapshot().wallet?.entitlements ?? null,
    store ? () => store.snapshot().wallet?.entitlements ?? null : none,
  );
}
