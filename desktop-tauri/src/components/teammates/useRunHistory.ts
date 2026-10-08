import { useCallback, useEffect, useRef, useState } from 'react';
import { message, teammateApi } from './api';
import { useTeammateFocus } from '../../state/teammateFocusStore';
import { loadRunTurns, probeRuns } from './runsV2';
import type { RunFeed } from '../../../../mobile/src/agents/v2/runCore.ts';
import type { Teammate, Turn } from './types';

/** v2 runs for one teammate conversation, polled by cursor with the contract's backoff. */
export function useRunHistory(agent: Teammate, active: boolean) {
  const requestedRunId = useTeammateFocus(s => s.requested?.id === agent.id ? s.requested.runId : undefined);
  const [turns, setTurns] = useState<Turn[]>([]), [ready, setReady] = useState(false), [loadError, setLoadError] = useState('');
  const feeds = useRef(new Map<string, RunFeed>()), delay = useRef(5000), sequence = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await loadRunTurns(teammateApi, agent.id, agent.chatId, feeds.current, requestedRunId);
      if (!alive.current || request !== sequence.current) return;
      delay.current = result.delay;
      setTurns(old => JSON.stringify(old) === JSON.stringify(result.turns) ? old : result.turns);
      setReady(true); setLoadError('');
    } catch (e) { if (alive.current && request === sequence.current) setLoadError(message(e)); throw e; }
  }, [agent.id, agent.chatId, requestedRunId]);
  useEffect(() => {
    if (!active) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { await refresh(); } catch {} if (!stopped) timer = setTimeout(poll, delay.current); };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [active, refresh]);
  return { turns, ready, loadError, refresh };
}

const modes = new Map<string, 'v1' | 'v2'>();
/**
 * v2 when this account's own v2 client route answers (flag + cohort); the
 * contract exposes no roster flag. Refusals keep v1 for the session; a transport
 * failure keeps v1 and asks again after a minute.
 */
export function useRunMode(identity: string, active: boolean): 'v1' | 'v2' {
  const [mode, setMode] = useState<'v1' | 'v2'>(() => modes.get(identity) ?? 'v1');
  useEffect(() => {
    if (!identity || !active || modes.has(identity)) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const result = await probeRuns(teammateApi);
      if (stopped) return;
      if (result.final) modes.set(identity, result.mode);
      setMode(result.mode);
      if (!result.final) timer = setTimeout(() => void ask(), 60000);
    };
    void ask(); return () => { stopped = true; clearTimeout(timer); };
  }, [identity, active]);
  return mode;
}
