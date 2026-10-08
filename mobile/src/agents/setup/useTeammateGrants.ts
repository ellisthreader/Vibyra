import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueProvider, ConnectionsApi, Grant, HubConnection, McpServer } from '../v2/connectionsModel';
import { operationsFor, toggleOperation } from '../v2/hubModel';

const words = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One teammate's v2 grants beside the account's connections. Each change saves at once. */
export function useTeammateGrants(api: ConnectionsApi | undefined, agentId: string | undefined, active: boolean) {
  const [connections, setConnections] = useState<HubConnection[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueProvider[]>([]);
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!api || !agentId) return;
    try {
      const [list, providers, held] = await Promise.all([api.list(), api.catalogue(), api.grants(agentId)]);
      const loaded = await Promise.all(list.filter(c => c.mcp).map(c => api.mcp(c.id).catch(() => null)));
      if (!alive.current) return;
      setConnections(list); setCatalogue(providers); setGrants(held); setError('');
      setServers(Object.fromEntries(loaded.filter((s): s is McpServer => s !== null).map(s => [s.connectionId, s])));
    } catch (e) { if (alive.current) setError(words(e)); }
  }, [api, agentId]);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);

  const ops = (c: HubConnection) => operationsFor(c.provider, catalogue, c.mcp ? servers[c.id] ?? { tools: [] } as unknown as McpServer : null);
  const grantOf = (c: HubConnection) => grants.find(g => g.connectionId === c.id && !g.revokedAt);
  const toggle = async (c: HubConnection, choice: string, on: boolean) => {
    if (!api || !agentId || busy) return;
    const next = toggleOperation(grantOf(c)?.operations ?? [], ops(c), choice, on);
    setBusy(`${c.id}:${choice}`); setError('');
    try {
      if (next.length) {
        const saved = await api.putGrant(agentId, c.id, next);
        if (alive.current) setGrants(list => [...list.filter(g => g.connectionId !== c.id), saved]);
      } else {
        await api.revokeGrant(agentId, c.id);
        if (alive.current) setGrants(list => list.filter(g => g.connectionId !== c.id));
      }
    } catch (e) { if (alive.current) setError(words(e)); }
    finally { if (alive.current) setBusy(null); }
  };
  return { connections, catalogue, busy, error, refresh, ops, grantOf, toggle };
}
