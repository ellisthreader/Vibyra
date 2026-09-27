import { useCallback, useEffect, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import { validateTurns } from './threadStorage';
import type { Turn } from './types';
interface Page { turns: Turn[]; hasMore?: boolean; nextBefore?: string | null }
export function useThreadHistory(chatId: string, active: boolean) {
  const [turns, setTurns] = useState<Turn[]>([]), [ready, setReady] = useState(false), [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(false), [loadingOlder, setLoadingOlder] = useState(false);
  const alive = useRef(true), sequence = useRef(0), cursor = useRef<string | null | undefined>(undefined), olderLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const page = await teammateApi<Page>(`vibes/chats/${chatId}/turns`), data = validateTurns(page, chatId);
      if (!alive.current || request !== sequence.current) return;
      setTurns(old => {
        const latest = new Map(data.map(turn => [turn.id, turn]));
        const next = [...old.filter(turn => !latest.has(turn.id)), ...data];
        return JSON.stringify(old) === JSON.stringify(next) ? old : next;
      });
      if (cursor.current === undefined) { cursor.current = page.nextBefore ?? null; setHasMore(page.hasMore === true && Boolean(page.nextBefore)); }
      setReady(true); setLoadError('');
    } catch (e) { if (alive.current && request === sequence.current) setLoadError(message(e)); throw e; }
  }, [chatId]);
  useEffect(() => {
    if (!active) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { await refresh(); } catch {} if (!stopped) timer = setTimeout(poll, 5000); };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [active, refresh]);
  const loadOlder = async () => {
    if (!cursor.current || olderLock.current || !active) return;
    olderLock.current = true; setLoadingOlder(true);
    try {
      const page = await teammateApi<Page>(`vibes/chats/${chatId}/turns?before=${encodeURIComponent(cursor.current)}`), data = validateTurns(page, chatId);
      if (!alive.current) return;
      setTurns(current => [...data.filter(turn => !current.some(t => t.id === turn.id)), ...current]);
      cursor.current = page.nextBefore ?? null; setHasMore(page.hasMore === true && Boolean(page.nextBefore)); setLoadError('');
    } catch (e) { if (alive.current) setLoadError(message(e)); throw e; }
    finally { olderLock.current = false; if (alive.current) setLoadingOlder(false); }
  };
  return { turns, ready, loadError, refresh, hasMore, loadOlder, loadingOlder };
}
