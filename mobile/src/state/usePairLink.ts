import { useCallback, useState } from 'react';
import { acceptPairLink, receivePairLink, type HeldPairLink } from './pairLink';
import { pairHostLabel } from './pairLinkDecision';
import type { WorkspaceStore } from './WorkspaceStore';

/** The link held for a tap (F-29), what it would replace, and the three things the sheet does with it. */
export function usePairLink(store: WorkspaceStore) {
  const [held, setHeld] = useState<HeldPairLink | null>(null);
  const receive = useCallback((url: string) => void receivePairLink(store, url, setHeld), [store]);
  const cancel = useCallback(() => setHeld(null), []);
  const accept = useCallback(() => {
    if (!held) return;
    setHeld(null);
    void acceptPairLink(store, held);
  }, [store, held]);
  const replaces = held && store.saved ? pairHostLabel(store.saved.host?.name ?? store.saved.pairing.name) : null;
  return { held, replaces, receive, accept, cancel };
}
