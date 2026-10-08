import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useTeammateFocus } from '../../state/teammateFocusStore';
import type { Turn } from './types';

/** A notification opens its exact task, including an explicitly fetched older task. */
export function useRequestedRunScroll(agentId: string, active: boolean, turns: Turn[],
  output: RefObject<HTMLDivElement | null>, follow: RefObject<boolean>) {
  const requested = useTeammateFocus(s => s.requested);
  const handled = useRef(0);
  useLayoutEffect(() => {
    if (!active || requested?.id !== agentId || !requested.runId || handled.current === requested.nonce) return;
    if (!turns.some(turn => turn.id === requested.runId)) return;
    const row = [...(output.current?.querySelectorAll<HTMLElement>('[data-run-id]') ?? [])]
      .find(element => element.dataset.runId === requested.runId);
    if (!row) return;
    handled.current = requested.nonce;
    follow.current = false;
    row.scrollIntoView({ block: 'start' });
  }, [agentId, active, requested, turns, output, follow]);
}
