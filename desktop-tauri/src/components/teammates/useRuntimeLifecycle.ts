import { useEffect } from 'react';
import type { CloudRuntimeStore } from '../../../../mobile/src/agents/v2/cloudRuntimeStore';

/** Inactive threads retain their subscriptions; only unmount invalidates pending work. */
export function useRuntimeLifecycle(store: CloudRuntimeStore, enabled: boolean) {
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => { if (enabled) void store.refresh(); }, [store, enabled]);
}
