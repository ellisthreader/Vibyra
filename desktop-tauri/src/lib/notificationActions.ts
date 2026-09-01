import { useProjectStore } from "../state/projectStore";
import { useNotificationStore } from "../state/notificationStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUpdateStore } from "../state/updateStore";
import { useTerminalStore } from "../state/terminalStore";
import { useAgentChatStore } from "../state/agentChatStore";
import { useAgentModeStore } from "../state/agentModeStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { hibernateIdleTerminals } from "./terminalHibernate";
import type { NotificationAction } from "../notificationTypes";
import type { RendererMode } from "../types";

// Actions are dispatched from components, never from the store: the store must
// stay free of imports from other stores or the cycle
// settingsStore -> terminalRegistry -> ... -> notificationStore closes.

/** Takes you to the queue from wherever you were — usually Code Mode. */
function openDecisions(): void {
  const mode = useAgentModeStore.getState();
  mode.setMode("agent");
  mode.openPanel("decisions");
}

/** Opens the chat a failed run created, in the mode that owns it. */
function openAgentChat(chatId: string): void {
  const mode = useAgentModeStore.getState();
  mode.setMode("agent");
  mode.selectChat(chatId);
  void useAgentChatStore.getState().openChat(chatId);
}

function focusSession(id: number): void {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  if (!pane) return;
  void useProjectStore
    .getState()
    .activate(pane.projectId)
    .then(() => useTerminalStore.getState().setFocus(id));
}

/** Stages a graphics mode for the next launch, saying what happened either
 * way. Both the promotion and the way back run through here so they cannot
 * drift apart. */
async function stageRendererMode(mode: RendererMode, stagedTitle: string): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.settings) return;
  try {
    await settings.update({ rendererMode: mode });
    useNotificationStore.getState().push({
      kind: "performance",
      tier: "done",
      title: stagedTitle,
      body: "Restart Vibyra when convenient. Your running terminals were left untouched.",
      dedupeKey: `perf:${mode}-staged`,
      osEligible: false,
    });
  } catch {
    useNotificationStore.getState().push({
      kind: "performance",
      tier: "risk",
      title: "Graphics mode could not be changed",
      body: "Open Performance settings and pick the mode manually.",
      dedupeKey: "perf:graphics-stage-failed",
      action: { id: "openGraphicsSettings", label: "Open performance settings" },
      osEligible: false,
    });
  }
}

export function runNotificationAction(action: NotificationAction): void {
  const workspace = useWorkspaceStore.getState();
  switch (action.id) {
    case "openDecisions":
      openDecisions();
      return;
    case "openAgentChat":
      if (typeof action.arg === "string") openAgentChat(action.arg);
      return;
    case "focusSession":
      if (typeof action.arg === "number") focusSession(action.arg);
      return;
    case "hibernateIdleTerminals":
      hibernateIdleTerminals();
      return;
    case "enableAcceleratedGraphics":
      void stageRendererMode("accelerated", "GPU rendering is ready for next launch");
      return;
    case "revertToAutoGraphics":
      void stageRendererMode("auto", "Automatic graphics is ready for next launch");
      return;
    case "openGraphicsSettings":
      workspace.openSettingsSection("performance");
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
    case "downloadUpdate":
      void useUpdateStore.getState().download();
      return;
    case "restartForUpdate":
      // Two clicks, still: this window holds live terminal sessions, and the
      // swap only happens on an explicit choice. The tier says as much.
      void useUpdateStore.getState().restart();
      return;
    case "openUpdateSettings":
      workspace.openSettingsSection("updates");
      return;
    case "openPreview":
      if (typeof action.arg === "string") {
        void useProjectStore.getState().activate(action.arg);
      }
      // Wide, not full: the pane that raised the notice stays on screen next
      // to the preview rather than being replaced by it.
      useWorkspaceStore.getState().setDockTool("preview");
      useWorkspaceStore.getState().setDockSize("wide");
      return;
    default:
      return;
  }
}
