import type { ReleasedModel } from "../ipc/models";
import type { PreviewStatus } from "../previewTypes";
import { useNotificationStore } from "../state/notificationStore";
import { useTerminalStore } from "../state/terminalStore";
import type { PaneState } from "../state/terminalStoreTypes";
import type { ActivityTransition } from "./activityTransitions";
import { notePreviewTransition } from "./previewNotifications";
import { exitNoticeSuppressed, exitNotification } from "./sessionExitNotifications";
import { terminalDisplayTitle } from "./terminalTitle";

// Impure glue: pulls the live pane out of the store, hands it to the pure
// decision functions, and pushes whatever comes back. Kept apart from those
// functions so they stay unit-testable, and apart from the store so the store
// keeps its no-other-store import rule.

export function notifySessionExit(id: number, code: number | null): void {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  const notice = exitNotification(pane, code, exitNoticeSuppressed(id));
  if (notice) useNotificationStore.getState().push(notice);
}

/**
 * A restored pane that could not be given its old conversation back.
 *
 * One shared dedupe key on purpose: restoring a workspace can start several of
 * these at once, and four identical notices say nothing the first one did not.
 */
export function notifyNewConversation(pane: PaneState): void {
  useNotificationStore.getState().push({
    category: "system",
    severity: "info",
    title: `${terminalDisplayTitle(pane)} started a new conversation`,
    body: "Its previous one could not be identified, so this pane is fresh. The output you were reading is still above it.",
    dedupeKey: "resume:new-conversation",
  });
}

/** A resume the agent refused outright, restarted clean rather than left dead. */
export function notifyResumeRestarted(pane: PaneState): void {
  useNotificationStore.getState().push({
    category: "system",
    severity: "warning",
    title: `${terminalDisplayTitle(pane)} could not continue where it left off`,
    body: "The agent refused its previous conversation, so the pane was restarted on a new one rather than left closed.",
    dedupeKey: "resume:restarted",
  });
}

function paneTitle(id: number): string {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  if (!pane) return "An agent";
  return terminalDisplayTitle(pane);
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
