import { create } from "zustand";

import { fsReadPreview, onFsChanged } from "../ipc/fs";
import { useNotificationStore } from "./notificationStore";
import {
  clampCompanionWidth,
  restoreCompanionTab,
  restoreCompanionWidth,
  saveCompanionTab,
  saveCompanionWidth,
  type CompanionTab,
} from "../lib/companionPreferences";
import type { FilePreview } from "../types";

export type { CompanionTab } from "../lib/companionPreferences";
export type ProjectMode = "terminals" | "preview";
export type SettingsSectionId =
  | "profile"
  | "general"
  | "notifications"
  | "ai"
  | "integrations"
  | "agents"
  | "shortcuts";

/** Routes a failure into the notification system as a sticky app error. */
function reportProblem(message: string | null): void {
  if (!message) return;
  useNotificationStore.getState().push({
    category: "system",
    severity: "danger",
    title: message,
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
  agentPickerOpen: boolean;
  paletteOpen: boolean;
  companionOpen: boolean;
  companionTab: CompanionTab;
  companionWidth: number;
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
  toggleCompanion: () => void;
  setCompanionTab: (tab: CompanionTab) => void;
  setCompanionWidth: (width: number) => void;
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
  agentPickerOpen: false,
  paletteOpen: false,
  companionOpen: true,
  companionTab: restoreCompanionTab(),
  companionWidth: restoreCompanionWidth(),
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

  toggleCompanion: () => set((state) => ({ companionOpen: !state.companionOpen })),

  setCompanionTab: (tab) => {
    saveCompanionTab(tab);
    set({ companionTab: tab, companionOpen: true });
  },

  setCompanionWidth: (width) => {
    const companionWidth = clampCompanionWidth(width);
    saveCompanionWidth(companionWidth);
    set({ companionWidth });
  },

  setProjectMode: (projectMode) => set({ projectMode }),

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
