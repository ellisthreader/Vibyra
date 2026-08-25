import { create } from "zustand";

import { getSettings, saveSettings } from "../ipc/settings";
import { DEFAULT_NOTIFICATIONS, normalizeNotifications } from "../lib/notificationPrefs";
import { normalizeRendererMode } from "../lib/rendererPolicy";
import { applySettingsToAll } from "../lib/terminalRegistry";
import { resolveTheme } from "../lib/xtermTheme";
import type { NotificationPrefs } from "../notificationTypes";
import type { ProjectSpec, Settings } from "../types";

interface SettingsStore {
  settings: Settings | null;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

function applyTheme(settings: Settings): void {
  document.documentElement.dataset.theme = resolveTheme(settings.theme);
  // Mirrors the prefers-reduced-motion kill rule in base-motion.css, so the
  // in-app toggle works without an OS-level accessibility change.
  if (settings.reduceMotion) {
    document.documentElement.dataset.reduceMotion = "true";
  } else {
    delete document.documentElement.dataset.reduceMotion;
  }
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    enabledAgentIds: Array.isArray(settings.enabledAgentIds) ? settings.enabledAgentIds : [],
    rendererMode: normalizeRendererMode(settings.rendererMode),
    // A hand-edited or older settings.json must not be able to break the pane.
    notifications: normalizeNotifications(settings.notifications),
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

/** Stable-reference selector, same reason as `useProjects` above: a missing
 * block resolves to the one frozen default object, never a fresh one. */
export function useNotificationPrefs(): NotificationPrefs {
  const settings = useSettingsStore((s) => s.settings);
  return settings?.notifications ?? DEFAULT_NOTIFICATIONS;
}
