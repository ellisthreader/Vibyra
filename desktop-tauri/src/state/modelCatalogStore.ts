import { create } from "zustand";

import { loadCatalog, type CompanyGroup } from "../lib/openRouterCatalog";
import { STATIC_GROUPS } from "../lib/staticModels";

// Selector rule: every field here is a stable reference; derive filtered
// views in render, never inside a selector.

interface ModelCatalogStore {
  groups: CompanyGroup[];
  source: "static" | "cache" | "live";
  loading: boolean;
  /** force bypasses the 15-min cache — used when a release is announced. */
  refresh: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useModelCatalogStore = create<ModelCatalogStore>((set) => ({
  groups: STATIC_GROUPS,
  source: "static",
  loading: false,

  refresh: async (force = false) => {
    if (inflight && !force) return inflight;
    set({ loading: true });
    inflight = loadCatalog(force)
      .then(({ groups, source }) => set({ groups, source, loading: false }))
      .catch(() => set({ loading: false }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));
