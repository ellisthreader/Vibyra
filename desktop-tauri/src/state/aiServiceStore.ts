import { create } from "zustand";

import { aiServiceStatus } from "../ipc/ai";
import { spendNotification, spendTier, type SpendTier } from "../lib/aiSpendNotifications";
import { useNotificationStore } from "./notificationStore";
import type { AiServiceStatus } from "../types";

/** Read-only. The service credential belongs to the deployment, not to the
 * person using it, so the renderer can ask what the state of it is and nothing
 * more — there is deliberately no `save` or `remove` here to call. The native
 * `set_openai_key` / `clear_openai_key` commands remain for that owner. */
interface AiServiceStore {
  status: AiServiceStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
}

// Fires once per tier per period. `AiUsage` already carries the day and month
// keys, so they double as the reset signal — no timer, nothing persisted.
let lastTier: SpendTier = "none";
let lastPeriod = "";

function warnOnSpend(usage: AiServiceStatus["usage"], limits: AiServiceStatus["limits"]): void {
  const period = `${usage.day}/${usage.month}`;
  if (period !== lastPeriod) {
    lastPeriod = period;
    lastTier = "none";
  }
  const tier = spendTier(usage, limits);
  if (tier === lastTier || tier === "none") {
    lastTier = tier;
    return;
  }
  lastTier = tier;
  const notice = spendNotification(tier);
  if (notice) useNotificationStore.getState().push(notice);
}

export const useAiServiceStore = create<AiServiceStore>((set) => ({
  status: null,
  error: null,

  refresh: async () => {
    try {
      const status = await aiServiceStatus();
      set({ status });
      warnOnSpend(status.usage, status.limits);
    } catch (error) {
      set({ error: String(error) });
    }
  },

}));
