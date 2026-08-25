import { useTerminalStore } from "../state/terminalStore";

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
