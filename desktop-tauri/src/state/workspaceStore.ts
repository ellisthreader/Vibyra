import { create } from "zustand";

import { fsReadPreview, onFsChanged } from "../ipc/fs";
import { useNotificationStore } from "./notificationStore";
import {
  clampCompanionWidth,
  restoreCompanionSize,
  saveCompanionSize,
  type CompanionSize,
  restoreCompanionTab,
  restoreCompanionOpen,
  saveCompanionOpen,
  restoreCompanionWidth,
  saveCompanionTab,
  saveCompanionWidth,
  type CompanionTab,
} from "../lib/companionPreferences";
import type { FilePreview } from "../types";
import type { SettingsPanelId, SettingsSectionId } from "./workspaceSettingsTypes";
export type { SettingsPanelId, SettingsSectionId } from "./workspaceSettingsTypes";

const PROJECT_SIDEBAR_KEY = "vibyra.desktop.projectsSidebarOpen";
function restoreProjectsSidebar(): boolean {
  try { return localStorage.getItem(PROJECT_SIDEBAR_KEY) !== "false"; } catch { return true; }
}
function saveProjectsSidebar(open: boolean): void {
  try { localStorage.setItem(PROJECT_SIDEBAR_KEY, String(open)); } catch { /* Convenience preference. */ }
}

export type { CompanionTab } from "../lib/companionPreferences";
export type ProjectMode = "terminals" | "preview";

/** Routes a failure into the notification system as a sticky app error. */
function reportProblem(message: string | null): void {
  if (!message) return;
  useNotificationStore.getState().push({
    category: "system",
    severity: "danger",
    title: "Something went wrong",
    body: message,
    dedupeKey: `system:${message}`,
    osEligible: false,
  });
}

interface WorkspaceStore {
  /** Root of the active project — set by projectStore.activate. */
  root: string | null;
  projectMode: ProjectMode;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  /** Set by a deep link; the pane opens that group, then clears it. */
  settingsPanel: SettingsPanelId | null;
  agentPickerOpen: boolean;
  paletteOpen: boolean;
  /** Saved chats from earlier runs, opened from the command palette. */
  historyOpen: boolean;
  projectsSidebarOpen: boolean;
  companionOpen: boolean;
  companionTab: CompanionTab;
  companionWidth: number;
  companionSize: CompanionSize;
  /** Bumped on every debounced fs change batch; tree nodes refetch on it. */
  fsVersion: number;
  preview: FilePreview | null;
  init: () => Promise<void>;
  openSettings: () => void;
  openSettingsSection: (section: SettingsSectionId, panel?: SettingsPanelId) => void;
  closeSettings: () => void;
  setSettingsSection: (section: SettingsSectionId) => void;
  clearSettingsPanel: () => void;
  openAgentPicker: () => void;
  closeAgentPicker: () => void;
  setPaletteOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setProjectsSidebarOpen: (open: boolean) => void;
  toggleCompanion: () => void;
  setCompanionTab: (tab: CompanionTab) => void;
  setCompanionWidth: (width: number) => void;
  setCompanionSize: (size: CompanionSize) => void;
  setProjectMode: (mode: ProjectMode) => void;
  openPreview: (path: string) => Promise<void>;
  closePreview: () => void;
  setError: (error: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  root: null,
  projectMode: "terminals",
  settingsOpen: false,
  settingsSection: "general",
  settingsPanel: null,
  agentPickerOpen: false,
  paletteOpen: false,
  historyOpen: false,
  projectsSidebarOpen: restoreProjectsSidebar(),
  companionOpen: restoreCompanionOpen(),
  companionTab: restoreCompanionTab(),
  companionWidth: restoreCompanionWidth(),
  companionSize: restoreCompanionSize(),
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

  openSettingsSection: (settingsSection, panel) =>
    set({ settingsOpen: true, settingsSection, settingsPanel: panel ?? null }),

  closeSettings: () => set({ settingsOpen: false, settingsSection: "general", settingsPanel: null }),

  setSettingsSection: (settingsSection) => set({ settingsSection, settingsPanel: null }),

  clearSettingsPanel: () => set({ settingsPanel: null }),

  openAgentPicker: () => set((state) => {
    if (state.companionSize === "full") saveCompanionOpen(false);
    return { agentPickerOpen: true, projectMode: "terminals", companionOpen: state.companionSize === "full" ? false : state.companionOpen };
  }),

  closeAgentPicker: () => set({ agentPickerOpen: false }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setHistoryOpen: (historyOpen) => set({ historyOpen }),

  setProjectsSidebarOpen: (open) => {
    saveProjectsSidebar(open);
    set({ projectsSidebarOpen: open });
  },

  toggleCompanion: () => set((state) => {
    saveCompanionOpen(!state.companionOpen);
    return { companionOpen: !state.companionOpen };
  }),

  setCompanionTab: (tab) => {
    saveCompanionOpen(true);
    saveCompanionTab(tab);
    set({ companionTab: tab, companionOpen: true, projectMode: "terminals" });
  },

  setCompanionSize: (size) => {
    saveCompanionOpen(true);
    saveCompanionSize(size);
    set({ companionSize: size, companionOpen: true });
  },

  setCompanionWidth: (width) => {
    const companionWidth = clampCompanionWidth(width);
    saveCompanionWidth(companionWidth);
    set({ companionWidth });
  },

  setProjectMode: (mode) => {
    if (mode === "preview") {
      saveCompanionOpen(true); saveCompanionTab("preview");
      set({ projectMode: "terminals", companionOpen: true, companionTab: "preview" });
    } else set({ projectMode: "terminals" });
  },

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
