import { create } from "zustand";

import { getSettings, saveSettings } from "../ipc/settings";
import { DEFAULT_NOTIFICATIONS, normalizeNotifications } from "../lib/notificationPrefs";
import { applyPerformanceMode, normalizePerformanceMode } from "../lib/performanceMode";
import { applySettingsToAll } from "../lib/terminalRegistry";
import { resolveTheme } from "../lib/xtermTheme";
import type { NotificationPrefs } from "../notificationTypes";
import type { ProjectSpec, Settings } from "../types";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface SettingsStore {
  settings: Settings | null;
  saveError: string;
  /** What the Settings header shows. "saved" settles back to idle by itself. */
  saveState: SaveState;
  load: () => Promise<void>;
  /** Immediate: switches, segmented choices, anything that is one click. */
  update: (partial: Partial<Settings>) => Promise<void>;
  /** Debounced: typed text and numbers, so a half-typed value never reaches
   * disk and running terminals are not re-fitted on every keystroke. */
  commit: (partial: Partial<Settings>) => void;
}

const COMMIT_DELAY_MS = 350;
const SAVED_SETTLE_MS = 1_800;
let commitTimer = 0;
let settleTimer = 0;
let staged: Partial<Settings> = {};

// Full settings snapshots must reach disk in the same order as UI changes.
let writes: Promise<void> = Promise.resolve();
function persistSettings(settings: Settings): Promise<void> {
  const write = writes.catch(() => {}).then(() => saveSettings(settings));
  writes = write;
  return write;
}

/** `rewrite: false` is for routine checkpoints: with nothing staged and no
 * failed write, disk already holds these settings, so only writes still in
 * flight are awaited instead of rewriting settings.json every 30 seconds. */
export async function flushSettings(rewrite = true): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) throw new Error('Settings have not finished loading.');
  const flushStaged = async () => {
    globalThis.clearTimeout(commitTimer);
    const batch = staged;
    staged = {};
    await useSettingsStore.getState().update(batch);
  };
  if (Object.keys(staged).length) await flushStaged();
  else if (rewrite || useSettingsStore.getState().saveState === 'error') await persistSettings(settings);
  for (;;) {
    if (Object.keys(staged).length) await flushStaged();
    const pending = writes;
    await pending;
    if (pending === writes && !Object.keys(staged).length) break;
  }
  useSettingsStore.setState({ saveError: '', saveState: 'saved' });
}

function applyTheme(settings: Settings): void {
  document.documentElement.dataset.theme = resolveTheme(settings.theme);
}

/** Everything the document element carries. Applied on load and on every
 * write, so both flags survive a settings.json edited outside the app. */
function applyDocument(settings: Settings): void {
  applyTheme(settings);
  applyPerformanceMode(settings.performanceMode);
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    agentView: settings.agentView === 'chat' ? 'chat' : 'terminal',
    enabledAgentIds: Array.isArray(settings.enabledAgentIds) ? settings.enabledAgentIds : [],
    // A hand-edited or older settings.json must not be able to break the pane.
    notifications: normalizeNotifications(settings.notifications),
    // Also repairs the boolean this setting used to be, so an older
    // settings.json resolves to a level rather than to `undefined`.
    performanceMode: normalizePerformanceMode(settings.performanceMode),
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  saveError: '',
  saveState: 'idle',

  load: async () => {
    await writes.catch(() => {});
    const settings = normalizeSettings(await getSettings());
    applyDocument(settings);
    set({ settings });
  },

  update: async (partial) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...partial };
    set({ settings: next, saveState: 'saving' });
    applyDocument(next);
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
    try {
      await persistSettings(next);
      set({ saveError: '', saveState: 'saved' });
      globalThis.clearTimeout(settleTimer);
      settleTimer = globalThis.setTimeout(() => {
        if (get().saveState === 'saved') set({ saveState: 'idle' });
      }, SAVED_SETTLE_MS);
    } catch (error) {
      set({ saveError: 'Settings could not be saved. Keep Vibyra open and retry before quitting.', saveState: 'error' });
      throw error;
    }
  },

  commit: (partial) => {
    staged = { ...staged, ...partial };
    set({ saveState: 'saving' });
    globalThis.clearTimeout(commitTimer);
    commitTimer = globalThis.setTimeout(() => {
      const batch = staged;
      staged = {};
      void get().update(batch).catch(() => {});
    }, COMMIT_DELAY_MS);
  },

}));

// Stable-reference selector: components re-render only when the project list
// itself changes (not on every unrelated setting), and never receive a fresh
// [] per snapshot (which would loop React's useSyncExternalStore).
const NO_PROJECTS: ProjectSpec[] = [];

export function useProjects(): ProjectSpec[] {
  return useSettingsStore((s) => s.settings?.projects ?? NO_PROJECTS);
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
  return useSettingsStore((s) => s.settings?.notifications ?? DEFAULT_NOTIFICATIONS);
}
