import { useCallback, useEffect, useRef, useState } from 'react';
import { localMcpApi } from '../../lib/localMcpApi';
import type { LocalSpec, LocalView } from '../../lib/localMcp';
import { teammateApi } from '../teammates/api';
import { words } from '../teammates/routinesClient';
import type { MacHub } from './useMacHub';

const POLL_MS = 4_000;

/** Local MCP servers on this Mac, joined with what the account knows about them (`hub.servers`). */
export function useLocalMcp(hub: MacHub) {
  const [views, setViews] = useState<LocalView[] | null>(null);
  const [onForAccount, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    try { const list = await localMcpApi.list(); if (alive.current) setViews(list); }
    catch (e) { if (alive.current) setError(words(e)); }
  }, []);
  useEffect(() => {
    void refresh();
    teammateApi<{ enabled?: boolean }>('agents/v2/local-mcp').then(r => alive.current && setOn(r?.enabled === true), () => alive.current && setOn(false));
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(key); setError('');
    try { await action(); return true; }
    catch (e) { if (alive.current) setError(words(e)); return false; }
    finally { if (alive.current) { await refresh(); await hub.refresh(); setBusy(null); } }
  };
  return {
    views, onForAccount, error, busy, refresh,
    /** Saves the definition, then lists its tools and registers them. A listing that fails leaves it saved, with the reason. */
    add: (spec: LocalSpec, secrets: Record<string, string>) => run(`add:${spec.id}`, async () => {
      const saved = await localMcpApi.save(spec, secrets);
      try { await localMcpApi.connect(saved.spec.id); }
      catch (e) { throw new Error(`Saved, but its tools could not be listed. ${words(e)}`); }
    }),
    connect: (id: string) => run(`connect:${id}`, () => localMcpApi.connect(id)),
    setEnabled: (id: string, on: boolean) => run(`on:${id}`, () => localMcpApi.setEnabled(id, on)),
    retry: (id: string) => run(`retry:${id}`, () => localMcpApi.retry(id)),
    remove: (id: string) => run(`remove:${id}`, () => localMcpApi.remove(id)),
  };
}
export type LocalMcp = ReturnType<typeof useLocalMcp>;
