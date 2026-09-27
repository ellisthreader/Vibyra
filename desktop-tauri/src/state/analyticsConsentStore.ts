import { create } from "zustand";

import { analyticsConsentGet, analyticsConsentSet, type AnalyticsChoice } from "../ipc/analytics";

interface ConsentState {
  choice: AnalyticsChoice;
  loaded: boolean;
  available: boolean;
  pendingSync: boolean;
  busy: boolean;
  error: string | null;
  dismissed: boolean;
  load: () => Promise<void>;
  choose: (choice: Exclude<AnalyticsChoice, "unknown">) => Promise<boolean>;
  dismiss: () => void;
}

export const useAnalyticsConsentStore = create<ConsentState>((set) => ({
  choice: "unknown",
  loaded: false,
  available: false,
  pendingSync: false,
  busy: false,
  error: null,
  dismissed: false,
  load: async () => {
    try {
      const result = await analyticsConsentGet();
      set({ choice: result.choice, loaded: true, available: result.available,
        pendingSync: result.pending_sync, error: null });
    } catch (error) {
      set({ loaded: true, available: false, error: String(error) });
    }
  },
  choose: async (choice) => {
    set({ busy: true, error: null });
    try {
      const result = await analyticsConsentSet(choice);
      set({ choice: result.choice, available: result.available, pendingSync: result.pending_sync,
        loaded: true, dismissed: true, busy: false });
      return true;
    } catch (error) {
      set({ error: String(error), busy: false });
      return false;
    }
  },
  dismiss: () => set({ dismissed: true }),
}));
