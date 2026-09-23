import { create } from "zustand";

import { useLaunchSettingsStore } from "./launchSettingsStore";

const STORAGE_KEY = "vibyra.default-accounts.v1";

/**
 * Which account each provider runs as by default, keyed by runtime id
 * (`codex`, `claude`, `gemini`). Chosen in Settings > AI accounts; the
 * launcher's per-project picker can still override it for the next terminal.
 * Only an id is stored — credentials stay in the account's own folder.
 */
interface ProviderDefaultStore {
  byRuntime: Record<string, string>;
  setDefault: (runtimeId: string, accountId: string) => void;
}

function restore(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => typeof value === "string") as [string, string][],
    );
  } catch {
    return {};
  }
}

export const useProviderDefaultStore = create<ProviderDefaultStore>((set) => ({
  byRuntime: restore(),
  setDefault: (runtimeId, accountId) => {
    set((state) => {
      const byRuntime = { ...state.byRuntime, [runtimeId]: accountId };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(byRuntime));
      } catch {
        // A preference; a storage failure must not block launching.
      }
      return { byRuntime };
    });
    // "Default" means every project. A project that had picked its own
    // account earlier would otherwise silently keep ignoring this choice.
    useLaunchSettingsStore.getState().clearAccountChoice(runtimeId);
  },
}));

/** The account a launch should use when the project has not chosen one. */
export function defaultAccountFor(runtimeId: string | null): string | null {
  if (!runtimeId) return null;
  return useProviderDefaultStore.getState().byRuntime[runtimeId] ?? null;
}
