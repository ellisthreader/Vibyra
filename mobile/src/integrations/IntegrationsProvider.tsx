import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authorizeInBrowser } from './authorizeInBrowser';
import { fallbackCatalogue } from './catalogue';
import type { Integration, IntegrationCatalogue, IntegrationsApi } from './types';

interface IntegrationsValue {
  catalogue: IntegrationCatalogue;
  /** What this account has actually connected, and may therefore mention in a chat. */
  installed: Integration[];
  /** True once a server catalogue has been received; false means the shipped list. */
  live: boolean;
  busy: boolean; error: string | null;
  refresh(): Promise<void>;
  connect(id: string, credential: string): Promise<void>;
  /** Connect by signing in on the provider's own page, for an `oauth` integration. */
  authorize(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
}
const empty: IntegrationsValue = {
  catalogue: fallbackCatalogue, installed: [], live: false, busy: false, error: null,
  refresh: async () => {}, connect: async () => {}, authorize: async () => {}, disconnect: async () => {},
};
const Context = createContext<IntegrationsValue>(empty);

export function IntegrationsProvider({ api, identity, children }: { api: IntegrationsApi | null; identity: string | null; children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<IntegrationCatalogue>(fallbackCatalogue);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adopt = useCallback((next: IntegrationCatalogue) => { setCatalogue(next); setLive(true); setError(null); }, []);
  const refresh = useCallback(async () => {
    if (!api) return;
    try { adopt(await api.catalogue()); }
    // The shipped list stays on screen; what is lost is only which are connected,
    // so the page says that rather than pretending nothing is.
    catch (e) { setError(e instanceof Error ? e.message : 'Integrations are temporarily unavailable.'); setLive(false); }
  }, [api, adopt]);
  const act = useCallback(async (run: () => Promise<IntegrationCatalogue>) => {
    setBusy(true); setError(null);
    try { adopt(await run()); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work. Please try again.'); throw e; }
    finally { setBusy(false); }
  }, [adopt]);
  // Connections belong to an account, so a different account starts from the
  // shipped list rather than showing the last person's connected services.
  useEffect(() => { setCatalogue(fallbackCatalogue); setLive(false); void refresh(); }, [identity, refresh]);
  const value = useMemo<IntegrationsValue>(() => ({
    catalogue, live, busy, error,
    installed: catalogue.integrations.filter(integration => integration.installed),
    refresh,
    connect: (id, credential) => act(() => api!.connect(id, credential)).then(() => {}),
    authorize: id => act(() => api!.authorize ? api!.authorize(id) : authorizeInBrowser(api!, id)).then(() => {}),
    disconnect: id => act(() => api!.disconnect(id)).then(() => {}),
  }), [catalogue, live, busy, error, api, refresh, act]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useIntegrations() { return useContext(Context); }
