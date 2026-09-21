import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authorizeInBrowser, CANCELLED } from './authorizeInBrowser';
import { fallbackCatalogue } from './catalogue';
import type { Integration, IntegrationCatalogue, IntegrationsApi } from './types';

interface IntegrationsValue {
  catalogue: IntegrationCatalogue;
  installed: Integration[];
  live: boolean;
  /** Which integration is working, if any. One card's sign-in must not disable the others. */
  busy: string | null; error: string | null;
  refresh(): Promise<void>;
  connect(id: string, credential: string): Promise<void>;
  authorize(id: string, signal?: AbortSignal): Promise<void>;
  disconnect(id: string): Promise<void>;
}
const empty: IntegrationsValue = {
  catalogue: fallbackCatalogue, installed: [], live: false, busy: null, error: null,
  refresh: async () => {}, connect: async () => {}, authorize: async () => {}, disconnect: async () => {},
};
const Context = createContext<IntegrationsValue>(empty);

export function IntegrationsProvider({ api, identity, children }: {
  api: IntegrationsApi | null; identity: string | null; children: ReactNode;
}) {
  const [catalogue, setCatalogue] = useState(fallbackCatalogue);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holder = useRef({ identity, api });
  const version = useRef(0);
  const working = useRef<AbortController | null>(null);
  const refreshPending = useRef(false);
  const mounted = useRef(true);
  if (holder.current.identity !== identity || holder.current.api !== api) {
    holder.current = { identity, api }; version.current += 1;
  }
  const adopt = useCallback((next: IntegrationCatalogue) => {
    setCatalogue(next); setLive(true); setError(null);
  }, []);
  const refresh = useCallback(async () => {
    if (!api) return;
    if (working.current) { refreshPending.current = true; return; }
    refreshPending.current = false;
    const request = ++version.current;
    try { const next = await api.catalogue(); if (request === version.current) adopt(next); }
    catch (e) {
      if (request !== version.current) return;
      setError(e instanceof Error ? e.message : 'Integrations are temporarily unavailable.'); setLive(false);
    }
  }, [api, adopt]);
  useEffect(() => {
    working.current?.abort();
    setCatalogue(fallbackCatalogue); setLive(false); setError(null);
    void refresh();
  }, [identity, refresh]);
  const refreshLatest = useRef(refresh);
  refreshLatest.current = refresh;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; version.current += 1; working.current?.abort(); };
  }, []);
  const act = useCallback(async (id: string, run: (signal: AbortSignal) => Promise<IntegrationCatalogue>, signal?: AbortSignal) => {
    if (working.current) throw new Error('Finish the current connection first, then try again.');
    if (!api) throw new Error('Integrations are temporarily unavailable.');
    const control = new AbortController();
    const cancel = () => control.abort();
    signal?.addEventListener('abort', cancel);
    if (signal?.aborted) control.abort();
    working.current = control;
    const request = ++version.current;
    setBusy(id); setError(null);
    try {
      if (control.signal.aborted) throw new Error(CANCELLED);
      const next = await run(control.signal);
      if (request !== version.current) throw new Error('Your session changed. Please try again.');
      if (control.signal.aborted) throw new Error(CANCELLED);
      adopt(next);
    } catch (e) {
      // Backing out of a card is a choice, not a failure to report back at them.
      const cancelled = control.signal.aborted || (e instanceof Error && e.message === CANCELLED);
      if (request === version.current && !cancelled) setError(e instanceof Error ? e.message : 'That did not work. Please try again.');
      throw e;
    } finally {
      signal?.removeEventListener('abort', cancel);
      working.current = null;
      if (mounted.current) {
        setBusy(null);
        if (refreshPending.current || request !== version.current) void refreshLatest.current();
      }
    }
  }, [api, adopt]);
  const value = useMemo<IntegrationsValue>(() => ({
    catalogue, live, busy, error, installed: catalogue.integrations.filter(integration => integration.installed), refresh,
    connect: (id, credential) => act(id, () => api!.connect(id, credential)),
    authorize: (id, signal) => act(id, async active => (await (api!.authorize ? api!.authorize(id) : authorizeInBrowser(api!, id, active))).catalogue, signal),
    disconnect: id => act(id, () => api!.disconnect(id)),
  }), [catalogue, live, busy, error, refresh, api, act]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useIntegrations() { return useContext(Context); }
