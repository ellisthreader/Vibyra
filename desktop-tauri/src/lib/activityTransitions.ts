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
  /** Length of the working stretch behind this edge. The attention verdict
   * uses it to tell a finished run from a shell that merely printed a "?". */
  workedMs: number;
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
      transitions.push({ id, kind: "attention", workedMs: 0 });
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
      transitions.push({ id, kind: "quiet", workedMs: previous.workedMs });
      return { ...previous, quietNotified: true };
    }
    return previous;
  }

  // A working stretch ending right now measures itself. An idle → attention
  // edge inherits the stretch — the run that just settled is the one the
  // verdict is judging — but only while "just settled" is true: past the
  // settle window the run is old news, and a stray edge hours later must not
  // borrow it for a bogus "looks finished". An attention edge *consumes* the
  // stretch — the toast (or the user's own eyes on the pane) already spent
  // it, so what follows carries nothing and cannot re-announce the same run.
  const workedMs =
    previous.state === "working"
      ? now - previous.since
      : previous.state === "idle" && now - previous.since <= IDLE_SETTLE_MS
        ? previous.workedMs
        : 0;
  if (state === "attention" && !watching(id, context)) {
    transitions.push({ id, kind: "attention", workedMs });
  }
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

/** What an attention edge actually means, decided AFTER re-reading the pane.
 *
 * The byte-stream heuristic that raised the edge is deliberately loose, so
 * the verdict is what keeps toasts honest: only a parsed prompt block or an
 * explicit bell may claim the agent needs the user. A pane that worked a real
 * stretch and then settled on prompt-looking text (a summary question, an
 * empty composer) is reported as finished — the misfire this replaces called
 * exactly that "needs your permission". Anything else says nothing at all. */
export type AttentionVerdict = "ask" | "bell" | "finished" | "silent";

export function attentionVerdict(
  promptFound: boolean,
  fromBell: boolean,
  workedMs: number,
): AttentionVerdict {
  if (promptFound) return "ask";
  if (fromBell) return "bell";
  return workedMs >= IDLE_MIN_WORK_MS ? "finished" : "silent";
}

/** Maximum performance mode frees a pane idle this long. Long on purpose: a
 * hibernated pane shows a placeholder until clicked, so this must never race
 * the user reading the output of something that just finished. */
export const AUTO_HIBERNATE_IDLE_MS = 10 * 60_000;

/** Never the focused pane, never one asking for attention. */
export function shouldAutoHibernate(
  phase: SessionPhase,
  id: number,
  focusedId: number | null,
  now: number,
): boolean {
  return phase.state === "idle" && id !== focusedId && now - phase.since >= AUTO_HIBERNATE_IDLE_MS;
}
