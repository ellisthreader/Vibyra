import { useTerminalStore } from "../state/terminalStore";
import { shouldAutoHibernate, type SessionPhase } from "./activityTransitions";

/** Panes that are alive, on screen, and have not produced output recently. The
 * same set the titlebar counts as idle, so the offer matches what the user sees. */
function idleTerminalIds(): number[] {
  const { panes, activity } = useTerminalStore.getState();
  return panes
    .filter(
      (pane) =>
        pane.status === "running" &&
        pane.visibility !== "hibernated" &&
        activity[pane.id] === "idle",
    )
    .map((pane) => pane.id);
}

/** Frees the memory and delivery work of every idle pane immediately. Shared
 * by the performance notification action and the Settings Performance pane. */
export function hibernateIdleTerminals(): void {
  const hibernate = useTerminalStore.getState().hibernate;
  for (const id of idleTerminalIds()) void hibernate(id);
}

/** Maximum performance mode's sweep, run by the activity ticker: frees any
 * pane idle past `AUTO_HIBERNATE_IDLE_MS`, never the focused one. The phase
 * map already excludes hibernated panes, so this converges instead of
 * re-hibernating. Which panes qualify is `shouldAutoHibernate` — pure, and
 * tested without a store. */
export function autoHibernateIdle(
  phases: ReadonlyMap<number, SessionPhase>,
  now: number,
): void {
  const { focusedId, hibernate } = useTerminalStore.getState();
  for (const [id, phase] of phases) {
    if (shouldAutoHibernate(phase, id, focusedId, now)) void hibernate(id);
  }
}
