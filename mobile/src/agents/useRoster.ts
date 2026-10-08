import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AgentsApi, Roster, Teammate } from './types';
import { mergeRoster } from './v2/overviewModel';

/** `v2`: status, waiting approvals and unread come from `GET /roster`; a failed summary keeps the v1 values. */
export function useRoster(api: AgentsApi, signedIn: boolean, active = true, v2 = false) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (!signedIn || pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const listed = await api.list();
      const rows = v2 && api.overview ? await api.overview.roster().catch(() => null) : null;
      const result = rows ? { ...listed, teammates: mergeRoster(listed.teammates, rows) } : listed;
      if (alive.current) {
        setRoster(result);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not load teammates.');
    } finally {
      pending.current = false;
      if (alive.current) setLoading(false);
    }
  }, [api, signedIn, v2]);
  useEffect(() => {
    alive.current = true;
    if (!active)
      return () => {
        alive.current = false;
      };
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 10000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh, active]);
  const adopt = (teammate: Teammate) => {
    setRoster(
      (current) =>
        current && {
          ...current,
          teammates: [teammate, ...current.teammates.filter((a) => a.id !== teammate.id)],
        },
    );
    void refresh();
  };
  /** This device just marked a teammate read: clear the dot at once; the next poll confirms it. */
  const read = (id: string, cursor: string) =>
    setRoster((current) => current && { ...current, teammates: current.teammates.map((a) => (a.id === id && a.readCursor === cursor ? { ...a, unread: false } : a)) });
  return { roster, error, loading, refresh, adopt, read };
}
