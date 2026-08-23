import { useProjectStore } from "../state/projectStore";
import { useNotificationStore } from "../state/notificationStore";
import { useSettingsStore } from "../state/settingsStore";
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

async function enableAcceleratedGraphics(): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.settings) return;
  try {
    await settings.update({ rendererMode: "accelerated" });
    useNotificationStore.getState().push({
      category: "performance",
      severity: "success",
      title: "GPU rendering is ready for next launch",
      body: "Restart Vibyra when convenient. Your running terminals were left untouched.",
      dedupeKey: "perf:accelerated-staged",
      osEligible: false,
    });
  } catch {
    useNotificationStore.getState().push({
      category: "performance",
      severity: "warning",
      title: "Graphics mode could not be changed",
      body: "Open Graphics settings and choose Accelerated manually.",
      dedupeKey: "perf:accelerated-stage-failed",
      action: { id: "openGraphicsSettings", label: "Open graphics settings" },
      osEligible: false,
    });
  }
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
    case "enableAcceleratedGraphics":
      void enableAcceleratedGraphics();
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
