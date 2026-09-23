import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AgentsApi, Roster, Teammate } from './types';

export function useRoster(api: AgentsApi, signedIn: boolean, active = true) {
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
      const result = await api.list();
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
  }, [api, signedIn]);
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
  return { roster, error, loading, refresh, adopt };
}
