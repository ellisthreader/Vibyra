// Pure counterpart to `useBackgroundThrottle.ts`, split the same way
// `rendererPolicy.ts` is split from `xtermRenderer.ts`: the decisions live
// here where they can be tested, the listener and the IPC live in the hook.

/** The fields the decisions below need; the real pane type carries far more. */
export interface ThrottlePane {
  id: number;
  status: string;
  visibility: string;
}

/**
 * Panes worth demoting while the window is off screen: running, and on screen
 * as far as the store is concerned. Hibernated panes already send nothing and
 * hidden ones already flush slowly, so re-sending for those is IPC churn.
 */
export function panesToThrottle(panes: ThrottlePane[]): number[] {
  return panes
    .filter((pane) => pane.status === "running" && pane.visibility === "visible")
    .map((pane) => pane.id);
}

/**
 * Of the panes the hook demoted, the ones to put back. Anything that exited,
 * was closed, or was deliberately hidden while the window was away is dropped:
 * the store stays the source of truth for what the user asked for, and the
 * hook never writes to it.
 */
export function panesToRestore(demoted: number[], panes: ThrottlePane[]): number[] {
  return demoted.filter((id) =>
    panes.some(
      (pane) => pane.id === id && pane.status === "running" && pane.visibility === "visible",
    ),
  );
}
