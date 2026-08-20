import { create } from "zustand";

import { getSettings, saveSettings } from "../ipc/settings";
import { applySettingsToAll } from "../lib/terminalRegistry";
import { resolveTheme } from "../lib/xtermTheme";
import type { ProjectSpec, Settings } from "../types";

interface SettingsStore {
  settings: Settings | null;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

function applyTheme(settings: Settings): void {
  document.documentElement.dataset.theme = resolveTheme(settings.theme);
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    enabledAgentIds: Array.isArray(settings.enabledAgentIds) ? settings.enabledAgentIds : [],
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,

  load: async () => {
    const settings = normalizeSettings(await getSettings());
    applyTheme(settings);
    set({ settings });
  },

  update: async (partial) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...partial };
    set({ settings: next });
    applyTheme(next);
    // Re-fitting every xterm is only needed when appearance actually changed;
    // unrelated writes (project bookkeeping, agent toggles) must not disturb
    // running terminals.
    if (
      next.fontSize !== current.fontSize ||
      next.fontFamily !== current.fontFamily ||
      next.scrollbackLines !== current.scrollbackLines ||
      next.theme !== current.theme
    ) {
      applySettingsToAll(next);
    }
    await saveSettings(next);
  },

}));

// Stable-reference selector: components re-render only when the settings
// object itself changes, and never receive a fresh [] per snapshot (which
// would loop React's useSyncExternalStore).
const NO_PROJECTS: ProjectSpec[] = [];

export function useProjects(): ProjectSpec[] {
  const settings = useSettingsStore((s) => s.settings);
  return settings?.projects ?? NO_PROJECTS;
}

// In "auto" theme, follow the OS as it changes.
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  const settings = useSettingsStore.getState().settings;
  if (settings?.theme === "auto") {
    applyTheme(settings);
    applySettingsToAll(settings);
  }
});
