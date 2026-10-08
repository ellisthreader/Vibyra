import { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import type { OverviewApi } from './v2/overviewApi';
import { planKey, worthPlanning, type PlanRequest, type TaskPlan } from './v2/planModel';

/**
 * The task plan for what is in the composer (contract §6d). It asks only once typing pauses, only
 * for a message worth planning, and never gates Send: a failed or slow answer just shows nothing.
 * The last plan stays on screen while a newer one loads, so the card does not flicker per keystroke.
 */
export function useTaskPlan(api: Pick<OverviewApi, 'plan'> | undefined, request: PlanRequest, enabled: boolean, delay = 900) {
  const [state, setState] = useState<{ key: string; plan: TaskPlan | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = planKey(request);
  const live = Boolean(enabled && api && worthPlanning(request.prompt));
  const latest = useRef(request);
  latest.current = request;
  useEffect(() => {
    if (!live) { setState(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      api!.plan(latest.current, randomUUID())
        .then(plan => { if (current) setState({ key, plan }); })
        .catch(() => { if (current) setState({ key, plan: null }); });
    }, delay);
    return () => { current = false; clearTimeout(timer); };
  }, [key, live, nonce, api, delay]);
  const refresh = useCallback(() => setNonce(n => n + 1), []);
  return { plan: live ? state?.plan ?? null : null, loading: live && state?.key !== key, refresh };
}
