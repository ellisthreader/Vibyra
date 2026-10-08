import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeActivity, serviceFilters, type ActivityItem } from '../../../../mobile/src/agents/v2/activityModel.ts';
import { teammateApi } from './api';
import { connectionsClient } from './connectionsClient';
import { overviewClient } from './overviewClient';
import { words } from './routinesClient';

/** The activity feed: receipts newest first, filtered by service and teammate, a page at a time by cursor. */
export function useActivity(active: boolean) {
  const client = useMemo(() => overviewClient(teammateApi), []);
  const [provider, setProvider] = useState<string | null>(null), [agentId, setAgentId] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]), [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [more, setMore] = useState(false), [error, setError] = useState('');
  const [connected, setConnected] = useState<string[]>([]);
  const sequence = useRef(0);
  const load = useCallback(async (cursor: string | null) => {
    const mine = ++sequence.current;
    if (cursor) setMore(true); else setLoading(true);
    try {
      const page = await client.activity({ provider, agentId, cursor });
      if (mine !== sequence.current) return;
      setItems(old => (cursor ? mergeActivity(old, page.items) : page.items)); setNext(page.nextCursor); setError('');
    } catch (e) { if (mine === sequence.current) setError(words(e)); }
    finally { if (mine === sequence.current) { setLoading(false); setMore(false); } }
  }, [client, provider, agentId]);
  useEffect(() => { if (active) void load(null); }, [active, load]);
  // The service chips start from the accounts the person has connected; a failure just means fewer chips.
  useEffect(() => {
    let live = true;
    void connectionsClient(teammateApi).list().then(list => { if (live) setConnected([...new Set(list.map(c => c.provider))]); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const seen = useRef<string[]>([]);
  seen.current = [...new Set([...seen.current, ...items.map(i => i.provider ?? '')])];
  return { provider, setProvider, agentId, setAgentId, items, next, loading, more, error,
    loadMore: () => { if (next && !more) void load(next); }, refresh: () => void load(null),
    services: serviceFilters([...connected, ...seen.current], items, provider) };
}
