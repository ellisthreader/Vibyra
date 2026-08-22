import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { NotificationAction } from "../notificationTypes";

// Actions are dispatched from components, never from the store: the store must
// stay free of imports from other stores or the cycle
// settingsStore -> terminalRegistry -> ... -> notificationStore closes.

function focusSession(id: number): void {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  if (!pane) return;
  void useProjectStore
    .getState()
    .activate(pane.projectId)
    .then(() => useTerminalStore.getState().setFocus(id));
}

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

function hibernateIdleTerminals(): void {
  const hibernate = useTerminalStore.getState().hibernate;
  for (const id of idleTerminalIds()) void hibernate(id);
}

export function runNotificationAction(action: NotificationAction): void {
  const workspace = useWorkspaceStore.getState();
  switch (action.id) {
    case "focusSession":
      if (typeof action.arg === "number") focusSession(action.arg);
      return;
    case "hibernateIdleTerminals":
      hibernateIdleTerminals();
      return;
    case "openGraphicsSettings":
      // The graphics card lives inside the General pane, not a section of its own.
      workspace.openSettingsSection("general");
      return;
    case "openAiSettings":
      workspace.openSettingsSection("ai");
      return;
    case "openShortcutSettings":
      workspace.openSettingsSection("shortcuts");
      return;
    case "openModelPicker":
      workspace.openAgentPicker();
      return;
    case "openPreview":
      if (typeof action.arg === "string") {
        void useProjectStore.getState().activate(action.arg);
      }
      useWorkspaceStore.getState().setProjectMode("preview");
      return;
    default:
      return;
  }
}

