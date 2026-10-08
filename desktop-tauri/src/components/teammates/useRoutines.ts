import { useCallback, useEffect, useMemo, useState } from 'react';
import { teammateApi } from './api';
import { routinesClient, words } from './routinesClient';
import { NO_CAPABILITIES, type Capabilities, type Schedule } from '../../../../mobile/src/agents/v2/routinesModel.ts';
import type { Trigger } from '../../../../mobile/src/agents/v2/triggersModel.ts';

const known = new Map<string, Capabilities>();
/** What Agent V2 allows this account, asked once per session; any failure reports everything off. */
export function useCapabilities(identity: string): Capabilities {
  const client = useMemo(() => routinesClient(teammateApi), []);
  const [caps, setCaps] = useState(() => known.get(identity) ?? NO_CAPABILITIES);
  useEffect(() => {
    if (!identity || known.has(identity)) return;
    let live = true;
    void client.capabilities().then(result => { known.set(identity, result); if (live) setCaps(result); });
    return () => { live = false; };
  }, [client, identity]);
  return caps;
}

/** One teammate's schedules and triggers, loaded only for the parts the account may use. */
export function useRoutines(agentId: string, caps: Capabilities) {
  const client = useMemo(() => routinesClient(teammateApi), []);
  const [schedules, setSchedules] = useState<Schedule[]>([]), [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([caps.routines ? client.schedules(agentId) : [], caps.triggers ? client.triggers(agentId) : []]);
      setSchedules(s); setTriggers(t); setError(''); setLoaded(true);
    } catch (e) { setError(words(e)); }
  }, [agentId, caps.routines, caps.triggers, client]);
  useEffect(() => { if (caps.routines || caps.triggers) void refresh(); }, [caps.routines, caps.triggers, refresh]);
  const putSchedule = (next: Schedule | null, id: string) =>
    setSchedules(list => next ? (list.some(s => s.id === id) ? list.map(s => (s.id === id ? next : s)) : [next, ...list]) : list.filter(s => s.id !== id));
  const putTrigger = (next: Trigger | null, id: string) =>
    setTriggers(list => next ? (list.some(t => t.id === id) ? list.map(t => (t.id === id ? next : t)) : [next, ...list]) : list.filter(t => t.id !== id));
  return { client, schedules, triggers, loaded, error, refresh, putSchedule, putTrigger };
}
