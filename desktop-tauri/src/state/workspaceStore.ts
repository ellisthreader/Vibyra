import { create } from "zustand";

import { fsReadPreview, onFsChanged } from "../ipc/fs";
import {
  clampDockWidth,
  restoreCompactWidth,
  restoreDockTool,
  restoreWideRatio,
  saveCompactWidth,
  saveDockTool,
  saveWideRatio,
  type DockSize,
  type DockTool,
} from "../lib/dockLayout";
import { useNotificationStore } from "./notificationStore";
import type { FilePreview } from "../types";

export type { DockSize, DockTool } from "../lib/dockLayout";
export type SettingsSectionId =
  | "profile"
  | "general"
  | "performance"
  | "notifications"
  | "ai"
  | "integrations"
  | "agents"
  | "shortcuts"
  | "updates";

/** Routes a failure into the notification system as a sticky app error. */
function reportProblem(message: string | null): void {
  if (!message) return;
  useNotificationStore.getState().push({
    kind: "app",
    tier: "fail",
    title: message,
    dedupeKey: `system:${message}`,
    osEligible: false,
  });
}

interface WorkspaceStore {
  /** Root of the active project — set by projectStore.activate. */
  root: string | null;
  /** The tool the dock is showing, or null while it is closed. */
  dockTool: DockTool | null;
  /** How much room the dock gets when it is open. */
  dockSize: DockSize;
  /** Remembered width for each size, in that size's own unit. */
  dockCompactWidth: number;
  dockWideRatio: number;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  agentPickerOpen: boolean;
  paletteOpen: boolean;
  /** Bumped on every debounced fs change batch; tree nodes refetch on it. */
  fsVersion: number;
  preview: FilePreview | null;
  init: () => Promise<void>;
  openSettings: () => void;
  openSettingsSection: (section: SettingsSectionId) => void;
  closeSettings: () => void;
  setSettingsSection: (section: SettingsSectionId) => void;
  openAgentPicker: () => void;
  closeAgentPicker: () => void;
  setPaletteOpen: (open: boolean) => void;
  setDockTool: (tool: DockTool | null) => void;
  toggleDock: () => void;
  setDockSize: (size: DockSize) => void;
  setDockWidth: (value: number) => void;
  openPreview: (path: string) => Promise<void>;
  closePreview: () => void;
  setError: (error: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  root: null,
  dockTool: restoreDockTool(),
  dockSize: "compact",
  dockCompactWidth: restoreCompactWidth(),
  dockWideRatio: restoreWideRatio(),
  settingsOpen: false,
  settingsSection: "general",
  agentPickerOpen: false,
  paletteOpen: false,
  fsVersion: 0,
  preview: null,

  init: async () => {
    // Agents write files in bursts; coalesce change notifications so the file
    // tree refetches at most once a second instead of once per fs event batch.
    let pending = 0;
    await onFsChanged(() => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        set((state) => ({ fsVersion: state.fsVersion + 1 }));
      }, 1_000);
    });
  },

  openSettings: () => set({ settingsOpen: true }),

  openSettingsSection: (settingsSection) => set({ settingsOpen: true, settingsSection }),

  closeSettings: () => set({ settingsOpen: false, settingsSection: "general" }),

  setSettingsSection: (settingsSection) => set({ settingsSection }),

  openAgentPicker: () => set({ agentPickerOpen: true }),

  closeAgentPicker: () => set({ agentPickerOpen: false }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  // Selecting the tool that is already up closes the dock — the tab strip is
  // the toggle, so the titlebar does not need a fourth button beside the three
  // sizes. Null is never persisted: see `restoreDockTool`.
  setDockTool: (dockTool) => {
    if (dockTool) saveDockTool(dockTool);
    set({ dockTool });
  },

  toggleDock: () =>
    set((state) => ({ dockTool: state.dockTool ? null : restoreDockTool() })),

  setDockSize: (dockSize) =>
    set((state) => ({ dockSize, dockTool: state.dockTool ?? restoreDockTool() })),

  // One grip, two units: pixels while compact, a share of the workspace while
  // wide. Committed on release, so the terminals refit once per drag.
  setDockWidth: (value) =>
    set((state) => {
      const width = clampDockWidth(state.dockSize, value);
      if (state.dockSize === "compact") {
        saveCompactWidth(width);
        return { dockCompactWidth: width };
      }
      if (state.dockSize === "wide") {
        saveWideRatio(width);
        return { dockWideRatio: width };
      }
      return {};
    }),

  openPreview: async (path) => {
    try {
      set({ preview: await fsReadPreview(path) });
    } catch (error) {
      reportProblem(String(error));
    }
  },

  closePreview: () => set({ preview: null }),

  // Kept as a forwarder rather than removed: a dozen call sites across launch,
  // shortcuts, screenshots and startup already speak this shape, and none of
  // them need to know a notification system exists.
  setError: (error) => reportProblem(error),
}));
