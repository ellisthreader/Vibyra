import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accountsGranted, type GrantedAccounts } from '../../../../mobile/src/agents/v2/approvalAccount.ts';
import { teammateApi } from './api';
import { connectionsClient } from './connectionsClient';

export interface AccountCounts {
  /** How many accounts of this provider the teammate may use (2 when that could not be read). */
  count(provider: string): number;
  /** Re-reads the account list (at most every 10 s); an approval card calls it when it appears. */
  refresh(): void;
}
const client = connectionsClient(teammateApi);

/** The teammate's granted accounts per provider, so an approval card can tell two accounts apart (F-07). */
export function useGrantedAccounts(agentId: string, revision: number, enabled: boolean): AccountCounts {
  const [list, setList] = useState<GrantedAccounts>(null);
  const last = useRef(0);
  const refresh = useCallback(() => {
    if (!enabled || Date.now() - last.current < 10000) return;
    last.current = Date.now();
    client.list().then(setList, () => setList('failed'));
  }, [enabled]);
  // A changed teammate (new grants bump its revision) is read again at once.
  useEffect(() => { last.current = 0; refresh(); }, [agentId, revision, refresh]);
  return useMemo(() => ({ count: provider => accountsGranted(list, agentId, provider), refresh }), [list, agentId, refresh]);
}
