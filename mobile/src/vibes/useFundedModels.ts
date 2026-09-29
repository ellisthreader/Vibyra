import { useEffect, useState, useSyncExternalStore } from 'react';
import { useVibesStore } from './VibesProvider';
import type { FundedModel } from './types';
import { openRouterCatalog } from './openRouterCatalog';

const idle = () => () => {};
const empty = () => null;
export function useFundedModels(browse: boolean) {
  const store = useVibesStore();
  const state = useSyncExternalStore(store?.subscribe ?? idle, store?.snapshot ?? empty, store?.snapshot ?? empty);
  const [models, setModels] = useState<FundedModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [priced, setPriced] = useState(false);
  const eligible = state?.wallet?.entitlements.fundedTerminals === true;
  useEffect(() => {
    let active = true;
    if (!browse) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError(null); setPriced(false); setModels([]);
    const load = async () => {
      if (eligible && store?.api.terminalModels) {
        try {
          const rows = await store.api.terminalModels();
          if (active) { setModels(rows); setPriced(true); }
          return;
        } catch { /* An older/unavailable server must not hide the public catalogue. */ }
      }
      const rows = await openRouterCatalog(controller.signal);
      if (active) setModels(rows);
    };
    void load()
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Models could not be loaded.'); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [browse, eligible, store, revision]);
  return { models, eligible, priced, wallet: state?.wallet, store, loading, error, refresh: () => setRevision(v => v + 1) };
}
