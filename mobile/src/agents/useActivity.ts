import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeActivity, serviceFilters, type ActivityItem } from './v2/activityModel';
import type { ConnectionsApi } from './v2/connectionsModel';
import type { OverviewApi } from './v2/overviewApi';

export interface ActivityChoice { provider: string | null; agentId: string | null }

/** The activity feed: first page on open or filter change, then the server's cursor for each "Load more". */
export function useActivity(api: Pick<OverviewApi, 'activity'> | undefined, connections: Pick<ConnectionsApi, 'list'> | undefined, active: boolean) {
  const [choice, setChoice] = useState<ActivityChoice>({ provider: null, agentId: null });
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<string[]>([]);
  const sequence = useRef(0);
  const cursor = useRef<string | null>(null);
  cursor.current = next;
  const load = useCallback(async (append: boolean) => {
    if (!api) return;
    const request = ++sequence.current;
    if (append) setMore(true); else setState('loading');
    try {
      const page = await api.activity({ ...choice, cursor: append ? cursor.current : null });
      if (request !== sequence.current) return;
      setItems(old => (append ? mergeActivity(old, page.items) : page.items));
      setNext(page.nextCursor); setState('ready'); setError('');
    } catch (e) {
      if (request !== sequence.current) return;
      setError(e instanceof Error ? e.message : 'Activity could not be loaded.');
      if (!append) setState('error');
    } finally { if (request === sequence.current) setMore(false); }
  }, [api, choice]);
  useEffect(() => { if (active) void load(false); }, [active, load]);
  useEffect(() => {
    if (!active || !connections) return;
    let live = true;
    connections.list().then(list => { if (live) setConnected([...new Set(list.map(c => c.provider))]); }).catch(() => {});
    return () => { live = false; };
  }, [active, connections]);
  return {
    items, state, error, choice, loadingMore: more, hasMore: next !== null,
    services: serviceFilters(connected, items, choice.provider),
    setProvider: (provider: string | null) => setChoice(c => ({ ...c, provider })),
    setAgent: (agentId: string | null) => setChoice(c => ({ ...c, agentId })),
    loadMore: () => { if (next && !more) void load(true); },
    refresh: () => void load(false),
  };
}
