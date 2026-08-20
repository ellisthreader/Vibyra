export type CompanionTab = "chat" | "memory" | "files";

export const COMPANION_DEFAULT_WIDTH = 360;
export const COMPANION_MIN_WIDTH = 300;
export const COMPANION_MAX_WIDTH = 520;

const WIDTH_KEY = "vibyra.desktop.companionWidth";
const TAB_KEY = "vibyra.desktop.companionTab";

interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): PreferenceStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function clampCompanionWidth(value: number): number {
  const width = Number.isFinite(value) ? Math.round(value) : COMPANION_DEFAULT_WIDTH;
  return Math.max(COMPANION_MIN_WIDTH, Math.min(COMPANION_MAX_WIDTH, width));
}

export function restoreCompanionWidth(storage = browserStorage()): number {
  if (!storage) return COMPANION_DEFAULT_WIDTH;
  try {
    const stored = storage.getItem(WIDTH_KEY);
    return stored === null ? COMPANION_DEFAULT_WIDTH : clampCompanionWidth(Number(stored));
  } catch {
    return COMPANION_DEFAULT_WIDTH;
  }
}

export function saveCompanionWidth(width: number, storage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(WIDTH_KEY, String(clampCompanionWidth(width)));
  } catch {
    // Panel sizing is convenience state and must never block the workspace.
  }
}

export function restoreCompanionTab(storage = browserStorage()): CompanionTab {
  if (!storage) return "chat";
  try {
    const value = storage.getItem(TAB_KEY);
    return value === "memory" || value === "files" ? value : "chat";
  } catch {
    return "chat";
  }
}

export function saveCompanionTab(tab: CompanionTab, storage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TAB_KEY, tab);
  } catch {
    // The selected tool remains usable when storage is unavailable.
  }
}
