import { useCallback, useEffect, useRef, useState } from 'react';
import { message, teammateApi, teammateApiDevice } from './api';
import { mergeRoster } from '../../../../mobile/src/agents/v2/overviewModel.ts';
import { overviewClient } from './overviewClient';
import type { Roster, Teammate } from './types';
const overview = overviewClient(teammateApi, teammateApiDevice);
/** `v2`: status, approvals waiting and unread come from `GET /roster` per device; a failure keeps the v1 values. */
export function useRoster(active: boolean, identity: string, v2 = false) {
  const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current; setLoading(true);
    try {
      const data = await teammateApi<Roster>('agents/v1/teammates');
      if (data.version !== 1 || !Array.isArray(data.teammates)) throw new Error('Unsupported teammate response.');
      if (v2) { const rows = await overview.roster().catch(() => null); data.teammates = mergeRoster(data.teammates, rows); }
      if (alive.current && request === sequence.current) { setRoster(data); setError(''); }
    } catch (e) { if (alive.current && request === sequence.current) setError(message(e)); }
    finally { if (alive.current && request === sequence.current) setLoading(false); }
  }, [v2]);
  useEffect(() => {
    if (!active || !identity) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 10000); };
    void poll();
    const online = () => { void refresh(); }; window.addEventListener('online', online);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('online', online); };
  }, [active, identity, refresh]);
  const saved = (agent: Teammate) => {
    sequence.current++; setLoading(false); setError('');
    setRoster(r => r ? { ...r, teammates: [agent, ...r.teammates.filter(a => a.id !== agent.id)] } : r);
  };
  /** A save from inside a thread: the row stays where it is. */
  const replace = (agent: Teammate) => {
    sequence.current++; setLoading(false);
    setRoster(r => r ? { ...r, teammates: r.teammates.map(a => a.id === agent.id ? agent : a) } : r);
  };
  const read = (id: string, cursor: string) => {
    sequence.current++; setLoading(false);
    setRoster(r => r ? { ...r, teammates: r.teammates.map(agent => agent.id === id && agent.readCursor === cursor
      ? { ...agent, unread: false } : agent) } : r);
  };
  return { roster, error, loading, refresh, saved, replace, read };
}
