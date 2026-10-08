import { useEffect, useState } from 'react';
import type { RunsApi } from './runsApi';

/**
 * Chooses the teammate engine for this account. The contract exposes no roster
 * flag, so the account's own v2 client route answers: 2xx means the flag and
 * cohort admit it; 401/403/404/503 keep v1. An inconclusive answer keeps v1 and
 * asks again a minute later. Both paths coexist until v1 retires.
 */
export function useRunMode(runs: RunsApi | undefined, signedIn: boolean): 'v1' | 'v2' {
  const [mode, setMode] = useState<'v1' | 'v2'>('v1');
  useEffect(() => {
    if (!runs || !signedIn) { setMode('v1'); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const result = await runs.probe();
      if (stopped) return;
      setMode(result.mode);
      if (!result.final) timer = setTimeout(() => void ask(), 60000);
    };
    void ask();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [runs, signedIn]);
  return mode;
}
