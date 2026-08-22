import type { ReleasedModel } from "../ipc/models";
import type { PreviewStatus } from "../previewTypes";
import { useNotificationStore } from "../state/notificationStore";
import { useTerminalStore } from "../state/terminalStore";
import type { ActivityTransition } from "./activityTransitions";
import { notePreviewTransition } from "./previewNotifications";
import { exitNoticeSuppressed, exitNotification } from "./sessionExitNotifications";

// Impure glue: pulls the live pane out of the store, hands it to the pure
// decision functions, and pushes whatever comes back. Kept apart from those
// functions so they stay unit-testable, and apart from the store so the store
// keeps its no-other-store import rule.

export function notifySessionExit(id: number, code: number | null): void {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  const notice = exitNotification(pane, code, exitNoticeSuppressed(id));
  if (notice) useNotificationStore.getState().push(notice);
}

function paneTitle(id: number): string {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  if (!pane) return "An agent";
  return pane.customTitle || pane.osc || pane.title;
}

export function notifyActivityTransitions(transitions: ActivityTransition[]): void {
  const push = useNotificationStore.getState().push;
  for (const transition of transitions) {
    const label = paneTitle(transition.id);
    const action = { id: "focusSession", label: "Open terminal", arg: transition.id } as const;
    if (transition.kind === "attention") {
      push({
        category: "agentAttention",
        severity: "warning",
        title: `${label} needs you`,
        body: "It is waiting on an answer before it can carry on.",
        dedupeKey: `attention:${transition.id}`,
        timeoutMs: 0,
        action,
      });
      continue;
    }
    push({
      category: "agentDone",
      severity: "success",
      title: `${label} has gone quiet`,
      body: "No output for a while — it may be finished.",
      // Shares the completion key so a quiet run and a real exit collapse together.
      dedupeKey: "agentDone",
      action,
    });
  }
}

/** Replaces the old habit of routing new-model news through the error toast. */
export function notifyModelsReleased(models: ReleasedModel[]): void {
  if (models.length === 0) return;
  const names = models.slice(0, 3).map((model) => model.name).join(", ");
  useNotificationStore.getState().push({
    category: "models",
    severity: "info",
    title: models.length === 1 ? "New model released" : `${models.length} new models released`,
    body: models.length > 3 ? `${names}…` : names,
    dedupeKey: "models",
    osEligible: false,
    action: { id: "openModelPicker", label: "Choose a model" },
  });
}

/** Preview phases are polled, so the edge is derived from the last status the
 * module saw rather than from an event. */
export function notifyPreviewStatus(next: PreviewStatus): void {
  const notice = notePreviewTransition(next);
  if (notice) useNotificationStore.getState().push(notice);
}
