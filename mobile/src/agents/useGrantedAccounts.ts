import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionsApi } from './v2/connectionsModel';
import { accountsGranted, type GrantedAccounts } from './v2/approvalAccount';

export interface AccountCounts {
  /** How many accounts of this provider the teammate may use (2 when that could not be read). */
  count(provider: string): number;
  /** Re-reads the account list (at most every 10 s); an approval card calls it when it appears. */
  refresh(): void;
}

/** The teammate's granted accounts per provider, so an approval card can tell two accounts apart (F-07). */
export function useGrantedAccounts(connections: ConnectionsApi | undefined, agentId: string, revision: number): AccountCounts {
  const [list, setList] = useState<GrantedAccounts>(null);
  const last = useRef(0);
  const refresh = useCallback(() => {
    if (!connections || Date.now() - last.current < 10000) return;
    last.current = Date.now();
    connections.list().then(setList, () => setList('failed'));
  }, [connections]);
  // A changed teammate (new grants bump its revision) is read again at once.
  useEffect(() => { last.current = 0; refresh(); }, [agentId, revision, refresh]);
  return useMemo(() => ({ count: provider => accountsGranted(list, agentId, provider), refresh }), [list, agentId, refresh]);
}
