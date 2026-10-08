import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueProvider, ConnectionsApi, HubConnection, McpServer } from '../../agents/v2/connectionsModel';
import { CANCELLED } from '../authorizeInBrowser';
import { hubSignIn } from './hubSignIn';

const words = (error: unknown) => (error instanceof Error ? error.message : String(error));
const cancelled = (error: unknown) => error instanceof Error && (error.message === CANCELLED || /cancelled/i.test(error.message));

/** The hub's accounts, catalogue and MCP servers, with one action in flight at a time. */
export function useConnectionsHub(api: ConnectionsApi, active: boolean) {
  const [connections, setConnections] = useState<HubConnection[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueProvider[]>([]);
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, providers] = await Promise.all([api.list(), api.catalogue()]);
      if (!alive.current) return;
      setConnections(list); setCatalogue(providers); setError('');
      const mcp = list.filter(c => c.mcp);
      const loaded = await Promise.all(mcp.map(c => api.mcp(c.id).catch(() => null)));
      if (alive.current) setServers(Object.fromEntries(loaded.filter((s): s is McpServer => s !== null).map(s => [s.connectionId, s])));
    } catch (e) { if (alive.current) setError(words(e)); }
  }, [api]);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);

  /** Runs one action; the list is re-read afterwards so status pills come from the server. */
  const run = async (key: string, action: () => Promise<unknown>, reload = true) => {
    if (busy) return false;
    setBusy(key); setError('');
    try { await action(); if (reload) await refresh(); return true; }
    catch (e) { if (alive.current && !cancelled(e)) setError(words(e)); return false; }
    finally { if (alive.current) setBusy(null); }
  };
  const putServer = (server: McpServer) => setServers(all => ({ ...all, [server.connectionId]: server }));

  return {
    connections, catalogue, servers, error, busy, refresh,
    addAccount: (provider: string) => run(`add:${provider}`, () => hubSignIn(api, returnUrl => api.start(provider, returnUrl))),
    reconnect: (c: HubConnection) => run(`reconnect:${c.id}`, () => c.mcp
      ? hubSignIn(api, returnUrl => api.mcpSignIn(c.id, returnUrl))
      : hubSignIn(api, returnUrl => api.start(c.provider, returnUrl))),
    paste: (provider: string, credential: string) => run(`paste:${provider}`, () => api.paste(provider, credential)),
    disconnect: (c: HubConnection) => run(`remove:${c.id}`, () => api.remove(c.id)),
    addMcp: (url: string) => run('mcp:add', async () => {
      let added: string | null = null;
      await hubSignIn(api, async returnUrl => {
        const result = await api.addMcp(url.trim(), returnUrl);
        added = result.connection.id; putServer(result.server);
        return result.signIn;
      }).catch(e => { if (!added) throw e; if (!cancelled(e)) throw e; });
    }),
    mcpRefresh: (id: string) => run(`mcp:refresh:${id}`, async () => putServer(await api.mcpRefresh(id))),
    mcpApprove: (server: McpServer) => run(`mcp:approve:${server.connectionId}`, async () => {
      if (server.pending) putServer(await api.mcpApprove(server.connectionId, server.pending.revision));
    }),
    mcpReads: (id: string, tools: string[]) => run(`mcp:reads:${id}`, async () => putServer(await api.mcpReads(id, tools)), false),
  };
}
export type ConnectionsHubState = ReturnType<typeof useConnectionsHub>;
