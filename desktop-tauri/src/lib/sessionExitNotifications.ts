import type { PaneState } from "../state/terminalStoreTypes";
import type { NotificationInput } from "../notificationTypes";

// A PTY exit is the one unambiguous "this run is over" signal the desktop has.
// The decision of whether it is worth saying is pure and lives here; the wiring
// is in useNotificationRuntime.

/** Shells and SSH sessions are the user's own; they exit because the user typed
 * `exit`, which is not news. */
const SILENT_AGENTS = new Set(["shell", "ssh"]);

const suppressed = new Map<number, number>();

/** How long a deliberate teardown stays suppressed. Bounded on purpose: a leaked
 * entry must never mute a session for the rest of the run. */
const SUPPRESS_MS = 5_000;

/**
 * Marks the next exit for `id` as expected. Restart kills the old PTY before
 * respawning, so without this every restart would report a failed run.
 */
export function suppressExitNotice(id: number): void {
  const existing = suppressed.get(id);
  if (existing !== undefined) window.clearTimeout(existing);
  suppressed.set(
    id,
    window.setTimeout(() => suppressed.delete(id), SUPPRESS_MS),
  );
}

export function exitNoticeSuppressed(id: number): boolean {
  return suppressed.has(id);
}

/**
 * Builds the notification for a finished run, or null when there is nothing
 * worth saying.
 *
 * A null exit code means the process was killed rather than finishing — closed,
 * hibernated, or torn down by a restart — so it never notifies.
 */
export function exitNotification(
  pane: PaneState | undefined,
  code: number | null,
  isSuppressed: boolean,
): NotificationInput | null {
  if (!pane || isSuppressed || code === null) return null;
  if (SILENT_AGENTS.has(pane.agentId)) return null;
  // Same precedence as terminalStore.paneLabel, inlined so this module stays
  // pure: importing the store would drag zustand into a plain-logic unit test.
  const label = pane.customTitle || pane.osc || pane.title;
  const action = { id: "focusSession", label: "Open terminal", arg: pane.id } as const;
  if (code === 0) {
    return {
      category: "agentDone",
      severity: "success",
      title: `${label} finished`,
      // Shared across sessions so a burst of completions collapses into one line.
      dedupeKey: "agentDone",
      action,
    };
  }
  return {
    category: "agentFailed",
    severity: "danger",
    title: `${label} exited with code ${code}`,
    // Per session: a failure is worth its own row, and its own dismissal.
    dedupeKey: `agentFailed:${pane.id}`,
    timeoutMs: 0,
    action,
  };
}
