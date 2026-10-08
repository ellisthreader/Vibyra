import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teammateApi } from '../teammates/api';
import { connectionsClient } from '../teammates/connectionsClient';
import { words } from '../teammates/routinesClient';
import { useAccountStore } from '../../state/accountStore';
import type { CatalogueProvider, ConnectionsApi, HubConnection, McpAdded, McpPreset, McpServer, SignIn } from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { presetStandIns, visiblePresets } from '../../../../mobile/src/agents/v2/hubModel.ts';

const POLL_MS = 2_000, LIMIT_MS = 5 * 60_000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Opens the provider page in the external browser and watches the flow until it lands. */
export async function macSignIn(api: ConnectionsApi, begin: () => Promise<SignIn | null>, stopped: () => boolean) {
  if (stopped()) return;
  const signIn = await begin();
  if (!signIn || stopped()) return;
  await invoke('shared_chat_open_link', { url: signIn.url });
  const started = Date.now();
  while (!stopped()) {
    const state = await api.flow(signIn.flowId);
    if (stopped()) return;
    if (state.status === 'connected') return;
    if (state.status !== 'pending') throw new Error(state.error ?? 'The sign-in did not finish. Try again.');
    if (Date.now() - started > LIMIT_MS) throw new Error('The sign-in timed out. Try again.');
    await wait(POLL_MS);
  }
}

/** The Mac hub: accounts, catalogue and MCP servers, one action at a time. */
export function useMacHub(active: boolean) {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? null);
  const api = useMemo(() => connectionsClient(teammateApi), [identity]);
  const scope = useMemo(() => ({ api, identity, active }), [api, identity, active]);
  const latest = useRef(scope); latest.current = scope;
  const [loadedScope, setLoadedScope] = useState(scope);
  const [connections, setConnections] = useState<HubConnection[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueProvider[]>([]), [presets, setPresets] = useState<McpPreset[]>([]);
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true), request = useRef(0);
  const working = useRef<{ scope: typeof scope; cancelled: boolean } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = useCallback(() => alive.current && latest.current === scope && active && Boolean(identity)
    && identity === useAccountStore.getState().snapshot.profile?.email, [scope, active, identity]);
  const refresh = useCallback(async () => {
    if (!current()) return;
    const generation = ++request.current;
    const fresh = () => current() && generation === request.current;
    try {
      // The popular servers are a nicety: if they cannot be read the hub is the same without that group.
      const [list, providers, popular] = await Promise.all([api.list(), api.catalogue(), api.presets?.().catch((): McpPreset[] => []) ?? []]);
      const loaded = await Promise.all(list.filter(c => c.mcp).map(c => api.mcp(c.id).catch(() => null)));
      if (!fresh()) return;
      setConnections(list); setCatalogue(providers); setPresets(popular); setError('');
      setServers(Object.fromEntries(loaded.filter((s): s is McpServer => s !== null).map(s => [s.connectionId, s])));
    } catch (e) { if (fresh()) setError(words(e)); }
  }, [api, current]);
  useEffect(() => {
    if (working.current) working.current.cancelled = true;
    working.current = null;
    setLoadedScope(scope); setConnections(null); setCatalogue([]); setPresets([]); setServers({}); setBusy(null); setError('');
    if (active) void refresh();
  }, [scope, active, refresh]);
  const run = async (key: string, action: (stopped: () => boolean) => Promise<unknown>, reload = true) => {
    if (!current() || working.current?.scope === scope) return false;
    const ticket = { scope, cancelled: false }; working.current = ticket;
    const stopped = () => ticket.cancelled || !current();
    setBusy(key); setError('');
    try { await action(stopped); if (!current()) return false; if (reload) await refresh(); return !stopped(); }
    // An add whose sign-in fails has still created the server; show it (and its Reconnect) rather than a stale list.
    catch (e) { if (current() && reload) await refresh(); if (!stopped()) setError(words(e)); return false; }
    finally { if (current() && working.current === ticket) { working.current = null; setBusy(null); } }
  };
  const put = (s: McpServer) => { if (current()) setServers(all => ({ ...all, [s.connectionId]: s })); };
  const addServer = (key: string, add: () => Promise<McpAdded>) => run(key, stopped => macSignIn(api, async () => {
    const added = await add(); put(added.server); return added.signIn;
  }, stopped));
  const sameScope = loadedScope === scope;
  const list = sameScope ? connections : null, popular = sameScope ? presets : [];
  return {
    connections: list, catalogue: sameScope ? catalogue : [], servers: sameScope ? servers : {},
    error: sameScope ? error : '', busy: sameScope ? busy : null, refresh,
    /** Every preset the service lists (to match an added server to its mark) and the ones still worth offering. */
    allPresets: popular, standIns: presetStandIns(popular),
    presets: list ? visiblePresets(popular, list, new Set(list.map(c => c.provider))) : [],
    /** The person is signing in in their browser (an add or a reconnect), so Stop waiting makes sense. */
    waiting: busy !== null && /^(add:|reconnect:|mcp:add|mcp:preset:)/.test(busy),
    cancel: () => { if (working.current?.scope === scope) working.current.cancelled = true; },
    addAccount: (provider: string) => run(`add:${provider}`, stopped => macSignIn(api, () => api.start(provider), stopped)),
    reconnect: (c: HubConnection) => run(`reconnect:${c.id}`, stopped => macSignIn(api, () => c.mcp ? api.mcpSignIn(c.id) : api.start(c.provider), stopped)),
    paste: (provider: string, token: string) => run(`paste:${provider}`, () => api.paste(provider, token)),
    disconnect: (c: HubConnection) => run(`remove:${c.id}`, () => api.remove(c.id)),
    addMcp: (url: string) => addServer('mcp:add', () => api.addMcp(url.trim())),
    addPreset: (preset: McpPreset) => addServer(`mcp:preset:${preset.id}`, () => api.addMcp(preset.url, undefined, preset.name)),
    // A local server is listed again by the Mac that runs it; a remote one by the account.
    mcpRefresh: (id: string) => run(`mcp:refresh:${id}`, async () => {
      const local = servers[id]?.kind === 'local' ? servers[id]?.localId : null;
      if (local) { await invoke('local_mcp_connect', { id: local }); put(await api.mcp(id)); } else put(await api.mcpRefresh(id));
    }),
    mcpApprove: (s: McpServer) => run(`mcp:approve:${s.connectionId}`, async () => { if (s.pending) put(await api.mcpApprove(s.connectionId, s.pending.revision)); }),
    mcpReads: (id: string, tools: string[]) => run(`mcp:reads:${id}`, async () => put(await api.mcpReads(id, tools)), false),
  };
}
export type MacHub = ReturnType<typeof useMacHub>;
