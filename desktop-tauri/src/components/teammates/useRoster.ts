import { useCallback, useEffect, useRef, useState } from 'react';
import { message, teammateApi } from './api';
import type { Roster, Teammate } from './types';
export function useRoster(active: boolean, identity: string) {
  const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current; setLoading(true);
    try {
      const data = await teammateApi<Roster>('agents/v1/teammates');
      if (data.version !== 1 || !Array.isArray(data.teammates)) throw new Error('Unsupported teammate response.');
      if (alive.current && request === sequence.current) { setRoster(data); setError(''); }
    } catch (e) { if (alive.current && request === sequence.current) setError(message(e)); }
    finally { if (alive.current && request === sequence.current) setLoading(false); }
  }, []);
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
  return { roster, error, loading, refresh, saved };
}
