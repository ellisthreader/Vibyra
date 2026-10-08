import type { ActivityState } from "./activity";

// Edge detection over the coarse activity map. The ticker produces a level
// ("working" / "idle" / "attention") every 1.5s; notifications care about the
// moment it *changes*, so the diff lives here — pure, and unit-testable without
// React or timers.

/** A run must have been working this long before going quiet is worth saying. */
export const IDLE_MIN_WORK_MS = 20_000;
/** And then stay quiet this long — two ticks past activity.ts's own window. */
export const IDLE_SETTLE_MS = 6_000;

export interface SessionPhase {
  state: ActivityState;
  /** When this session entered `state`. */
  since: number;
  /** Length of the working stretch that preceded the current state. */
  workedMs: number;
  quietNotified: boolean;
}

export type TransitionKind = "attention" | "quiet";

export interface ActivityTransition {
  id: number;
  kind: TransitionKind;
}

export interface TransitionContext {
  now: number;
  /** Suppress "needs you" for a pane the user is already looking at. */
  focusedId: number | null;
  windowFocused: boolean;
  /** The "tell me when an agent goes quiet" preference; off by default. */
  idleEnabled: boolean;
}

function watching(id: number, context: TransitionContext): boolean {
  return context.windowFocused && context.focusedId === id;
}

function advance(
  id: number,
  state: ActivityState,
  previous: SessionPhase | undefined,
  context: TransitionContext,
  transitions: ActivityTransition[],
): SessionPhase {
  const { now } = context;
  if (!previous) {
    if (state === "attention" && !watching(id, context)) {
      transitions.push({ id, kind: "attention" });
    }
    return { state, since: now, workedMs: 0, quietNotified: false };
  }

  if (previous.state === state) {
    const settled = now - previous.since >= IDLE_SETTLE_MS;
    const worked = previous.workedMs >= IDLE_MIN_WORK_MS;
    if (
      state === "idle" &&
      context.idleEnabled &&
      !previous.quietNotified &&
      worked &&
      settled
    ) {
      transitions.push({ id, kind: "quiet" });
      return { ...previous, quietNotified: true };
    }
    return previous;
  }

  if (state === "attention" && !watching(id, context)) {
    transitions.push({ id, kind: "attention" });
  }
  const workedMs = previous.state === "working" ? now - previous.since : 0;
  return { state, since: now, workedMs, quietNotified: false };
}

/**
 * Folds the newest activity map into the previous phase map.
 *
 * Sessions absent from `next` are dropped, so closing a pane cannot leak a
 * phase entry — and a re-used id starts clean.
 */
export function detectTransitions(
  previous: ReadonlyMap<number, SessionPhase>,
  next: Readonly<Record<number, ActivityState>>,
  context: TransitionContext,
): { phases: Map<number, SessionPhase>; transitions: ActivityTransition[] } {
  const transitions: ActivityTransition[] = [];
  const phases = new Map<number, SessionPhase>();
  for (const [key, state] of Object.entries(next)) {
    const id = Number(key);
    phases.set(id, advance(id, state, previous.get(id), context, transitions));
  }
  return { phases, transitions };
}
