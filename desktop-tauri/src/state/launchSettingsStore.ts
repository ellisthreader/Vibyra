import { create } from "zustand";

export type LaunchPermission = "standard" | "full";
export type LaunchTokenSource = "accounts" | "vibyra";
export type LaunchEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra"
  | "ultracode";

export interface LaunchSettings {
  /** Catalog model id this project launches by default; null = top runnable. */
  modelId: string | null;
  terminalCount: number;
  effort: LaunchEffort;
  safeMode: boolean;
  permission: LaunchPermission;
  tokenSource: LaunchTokenSource;
  /**
   * Which account each provider launches as, by provider id.
   *
   * Only ever consulted for the provider a launch actually uses, and a missing
   * or since-removed entry falls back to the first account — so a project that
   * has never chosen is not a project that cannot launch.
   */
  accountByProvider: Record<string, string>;
}

// v2: safeMode became opt-in — with it on by default, non-Git projects could
// never launch a terminal at all.
const STORAGE_KEY = "vibyra.launch-settings.v2";
const DEFAULT_LAUNCH_SETTINGS: LaunchSettings = Object.freeze({
  modelId: null,
  terminalCount: 1,
  effort: "medium",
  safeMode: false,
  permission: "standard",
  tokenSource: "accounts",
  accountByProvider: {},
});

type StoredSettings = Record<string, LaunchSettings>;

function normalise(value: Partial<LaunchSettings> | undefined): LaunchSettings {
  const terminalCount = Math.max(1, Math.min(12, Math.round(Number(value?.terminalCount) || 1)));
  const rawEffort = String(value?.effort ?? "");
  const storedEffort = rawEffort === "pro" ? "ultra" : rawEffort;
  const effort: LaunchEffort = [
    "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode",
  ].includes(String(storedEffort)) ? storedEffort as LaunchEffort : "medium";
  return {
    modelId: typeof value?.modelId === "string" && value.modelId ? value.modelId : null,
    terminalCount,
    effort,
    safeMode: value?.safeMode === true,
    permission: value?.permission === "full" ? "full" : "standard",
    tokenSource: value?.tokenSource === "vibyra" ? "vibyra" : "accounts",
    accountByProvider: accountMap(value?.accountByProvider),
  };
}

/** Keeps only string-to-string entries: this is read back from localStorage,
 * where anything could be sitting, and it ends up naming a credential folder. */
function accountMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([provider, account]) => typeof provider === "string" && typeof account === "string",
    ) as [string, string][],
  );
}

function restore(): StoredSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Partial<LaunchSettings>>;
    return Object.fromEntries(Object.entries(raw).map(([projectId, value]) => [projectId, normalise(value)]));
  } catch {
    return {};
  }
}

function persist(settings: StoredSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Launch preferences are convenience state; storage failure must not block terminals.
  }
}

interface LaunchSettingsStore {
  byProject: StoredSettings;
  get: (projectId: string) => LaunchSettings;
  update: (projectId: string, patch: Partial<LaunchSettings>) => void;
}

export const useLaunchSettingsStore = create<LaunchSettingsStore>((set, get) => ({
  byProject: restore(),
  get: (projectId) => get().byProject[projectId] ?? DEFAULT_LAUNCH_SETTINGS,
  update: (projectId, patch) => {
    set((state) => {
      const byProject = {
        ...state.byProject,
        [projectId]: normalise({ ...(state.byProject[projectId] ?? DEFAULT_LAUNCH_SETTINGS), ...patch }),
      };
      persist(byProject);
      return { byProject };
    });
  },
}));

export function useProjectLaunchSettings(projectId: string | null): LaunchSettings {
  return useLaunchSettingsStore((state) =>
    projectId ? state.byProject[projectId] ?? DEFAULT_LAUNCH_SETTINGS : DEFAULT_LAUNCH_SETTINGS,
  );
}
