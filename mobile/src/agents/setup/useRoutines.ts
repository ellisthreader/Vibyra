import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoutinesApi } from '../v2/routinesApi';
import { NO_CAPABILITIES, type Capabilities, type Schedule } from '../v2/routinesModel';
import type { Trigger } from '../v2/triggersModel';

/**
 * Agent v2 routines for one saved teammate. Capabilities are asked once per client; when
 * they are off (or unknown) nothing else is requested and the setup keeps its drafts.
 */
export function useRoutines(api: RoutinesApi | undefined, agentId: string | undefined, active: boolean) {
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [error, setError] = useState('');
  const asked = useRef<RoutinesApi | undefined>(undefined);
  useEffect(() => {
    if (!api || !active || asked.current === api) return;
    asked.current = api;
    let live = true;
    void api.capabilities().then(value => { if (live) setCaps(value); });
    return () => { live = false; };
  }, [api, active]);
  const refresh = useCallback(async () => {
    if (!api || !agentId) return;
    try {
      const [s, t] = await Promise.all([
        caps.routines ? api.list(agentId) : Promise.resolve([]),
        caps.triggers ? api.triggers.list(agentId) : Promise.resolve([]),
      ]);
      setSchedules(s.filter(x => x.agentId === agentId));
      setTriggers(t.filter(x => x.agentId === agentId));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Routines could not be loaded.');
    }
  }, [api, agentId, caps.routines, caps.triggers]);
  useEffect(() => { if (active && (caps.routines || caps.triggers)) void refresh(); }, [active, caps, refresh]);
  const putSchedule = (next: Schedule | null, id: string) =>
    setSchedules(list => (next ? (list.some(s => s.id === id) ? list.map(s => (s.id === id ? next : s)) : [next, ...list]) : list.filter(s => s.id !== id)));
  const putTrigger = (next: Trigger | null, id: string) =>
    setTriggers(list => (next ? (list.some(t => t.id === id) ? list.map(t => (t.id === id ? next : t)) : [next, ...list]) : list.filter(t => t.id !== id)));
  return { caps, schedules, triggers, error, refresh, putSchedule, putTrigger };
}
export type RoutinesState = ReturnType<typeof useRoutines>;
