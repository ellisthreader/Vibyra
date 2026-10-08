import { useCallback, useMemo, useRef, useState } from 'react';
import type { PlanRequest, TaskPlan } from '../../../../mobile/src/agents/v2/planModel.ts';
import { teammateApi, teammateApiDevice } from './api';
import { overviewClient } from './overviewClient';

export type PlanState = { status: 'loading' } | { status: 'ready'; plan: TaskPlan } | { status: 'error' };

/**
 * The task plan card's data (contract §6d `POST /runs/preview`). Asked once per review; an answer for
 * an older draft is dropped. The card never gates Send, so a failure is just a quiet line.
 */
export function useTaskPlan() {
  const client = useMemo(() => overviewClient(teammateApi, teammateApiDevice), []);
  const [state, setState] = useState<PlanState | null>(null);
  const sequence = useRef(0), last = useRef<PlanRequest | null>(null);
  const load = useCallback((request: PlanRequest) => {
    const mine = ++sequence.current; last.current = request; setState({ status: 'loading' });
    client.plan(request, crypto.randomUUID())
      .then(plan => { if (mine === sequence.current) setState({ status: 'ready', plan }); })
      .catch(() => { if (mine === sequence.current) setState({ status: 'error' }); });
  }, [client]);
  const clear = useCallback(() => { sequence.current++; setState(null); }, []);
  const reload = useCallback(() => { if (last.current) load(last.current); }, [load]);
  return { state, load, clear, reload };
}
